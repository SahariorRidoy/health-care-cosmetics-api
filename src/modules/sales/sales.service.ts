import mongoose from 'mongoose';
import { SalesOrder, SalesOrderStatus } from './salesOrder.model';
import { Invoice } from './invoice.model';
import { CustomerPayment } from './customerPayment.model';
import { Customer } from './customer.model';
import { Warehouse } from '../warehouse/warehouse.model';
import { postMovement } from '../inventory/stock.service';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number) { return Math.round(n * 100) / 100; }

function calcOrderTotals(
  items: { qty: number; unitPrice: number; discount: number }[],
  taxPercent: number,
) {
  const subtotal = items.reduce((s, i) => s + round2(i.qty * i.unitPrice), 0);
  const discountAmount = items.reduce(
    (s, i) => s + round2(i.qty * i.unitPrice * (i.discount / 100)),
    0,
  );
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = round2(taxableAmount * (taxPercent / 100));
  const totalAmount = round2(taxableAmount + taxAmount);
  return { subtotal: round2(subtotal), discountAmount: round2(discountAmount), taxAmount, totalAmount };
}

function buildItems(rawItems: { item: string; description?: string; qty: number; unitPrice: number; discount: number; uom: string }[]) {
  return rawItems.map((i) => ({
    ...i,
    lineTotal: round2(i.qty * i.unitPrice * (1 - i.discount / 100)),
  }));
}

async function generateOrderNumber(): Promise<string> {
  const d = new Date();
  const prefix = `SO-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const count = await SalesOrder.countDocuments({ orderNumber: { $regex: `^${prefix}` } });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

async function generateInvoiceNumber(): Promise<string> {
  const d = new Date();
  const prefix = `INV-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const count = await Invoice.countDocuments({ invoiceNumber: { $regex: `^${prefix}` } });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

async function generateReceiptNumber(): Promise<string> {
  const d = new Date();
  const prefix = `RCP-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const count = await CustomerPayment.countDocuments({ receiptNumber: { $regex: `^${prefix}` } });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

// ── Sales Orders (T45) ────────────────────────────────────────────────────────

export async function getSalesOrders(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = { isActive: true };
  if (query.customer) filter.customer = query.customer;
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    SalesOrder.find(filter)
      .populate('customer', 'name code')
      .populate('warehouse', 'name code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    SalesOrder.countDocuments(filter),
  ]);
  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getSalesOrderById(id: string) {
  const order = await SalesOrder.findById(id)
    .populate('customer', 'name code contactPerson phone email')
    .populate('warehouse', 'name code')
    .populate('items.item', 'name sku type')
    .populate('items.uom', 'name symbol')
    .populate('createdBy', 'name');
  if (!order || !order.isActive) throw new AppError('Sales order not found', 404);
  return order;
}

export async function createSalesOrder(
  data: {
    customer: string;
    warehouse: string;
    items: { item: string; description?: string; qty: number; unitPrice: number; discount: number; uom: string }[];
    taxPercent: number;
    notes?: string;
    deliveryDate?: string;
  },
  createdBy: string,
) {
  const [customer, warehouse] = await Promise.all([
    Customer.findById(data.customer),
    Warehouse.findById(data.warehouse),
  ]);
  if (!customer || !customer.isActive) throw new AppError('Customer not found', 404);
  if (!warehouse || !warehouse.isActive) throw new AppError('Warehouse not found', 404);

  const orderNumber = await generateOrderNumber();
  const items = buildItems(data.items);
  const { subtotal, discountAmount, taxAmount, totalAmount } = calcOrderTotals(data.items, data.taxPercent);

  return SalesOrder.create({
    orderNumber,
    customer: data.customer,
    warehouse: data.warehouse,
    items,
    subtotal,
    discountAmount,
    taxPercent: data.taxPercent,
    taxAmount,
    totalAmount,
    notes: data.notes,
    deliveryDate: data.deliveryDate,
    createdBy,
  });
}

export async function updateSalesOrder(
  id: string,
  data: {
    items?: { item: string; description?: string; qty: number; unitPrice: number; discount: number; uom: string }[];
    taxPercent?: number;
    notes?: string;
    deliveryDate?: string;
  },
) {
  const order = await SalesOrder.findById(id);
  if (!order || !order.isActive) throw new AppError('Sales order not found', 404);
  if (order.status !== 'DRAFT') throw new AppError('Only DRAFT orders can be edited', 400);

  const update: Record<string, unknown> = {};
  if (data.notes !== undefined) update.notes = data.notes;
  if (data.deliveryDate !== undefined) update.deliveryDate = data.deliveryDate;

  if (data.items) {
    const taxPercent = data.taxPercent ?? order.taxPercent;
    const items = buildItems(data.items);
    const totals = calcOrderTotals(data.items, taxPercent);
    Object.assign(update, { items, taxPercent, ...totals });
  } else if (data.taxPercent !== undefined) {
    const rawItems = order.items.map((i) => ({
      qty: i.qty, unitPrice: i.unitPrice, discount: i.discount,
    }));
    const totals = calcOrderTotals(rawItems, data.taxPercent);
    Object.assign(update, { taxPercent: data.taxPercent, ...totals });
  }

  return SalesOrder.findByIdAndUpdate(id, update, { new: true, runValidators: true });
}

const SO_TRANSITIONS: Record<SalesOrderStatus, SalesOrderStatus[]> = {
  DRAFT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export async function updateSalesOrderStatus(id: string, newStatus: SalesOrderStatus, userId: string) {
  const order = await SalesOrder.findById(id);
  if (!order || !order.isActive) throw new AppError('Sales order not found', 404);
  if (!SO_TRANSITIONS[order.status].includes(newStatus)) {
    throw new AppError(`Cannot transition from ${order.status} to ${newStatus}`, 400);
  }

  // T49 — dispatch triggers SALES_DISPATCH stock movement
  if (newStatus === 'DISPATCHED') {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      for (const item of order.items) {
        await postMovement({
          type: 'SALES_DISPATCH',
          item: item.item,
          warehouse: order.warehouse,
          quantity: -item.qty,   // negative = stock out
          reference: order.orderNumber,
          referenceModel: 'SalesOrder',
          referenceId: order._id as unknown as string,
          notes: `Dispatch for order ${order.orderNumber}`,
          createdBy: userId,
          session,
        });
      }
      order.status = newStatus;
      await order.save({ session });
      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
    return order;
  }

  order.status = newStatus;
  return order.save();
}

export async function deleteSalesOrder(id: string) {
  const order = await SalesOrder.findById(id);
  if (!order || !order.isActive) throw new AppError('Sales order not found', 404);
  if (order.status !== 'DRAFT') throw new AppError('Only DRAFT orders can be deleted', 400);
  order.isActive = false;
  return order.save();
}

// ── Invoices (T46) ────────────────────────────────────────────────────────────

export async function getInvoices(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = { isActive: true };
  if (query.customer) filter.customer = query.customer;
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    Invoice.find(filter)
      .populate('customer', 'name code')
      .populate('salesOrder', 'orderNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Invoice.countDocuments(filter),
  ]);
  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getInvoiceById(id: string) {
  const invoice = await Invoice.findById(id)
    .populate('customer', 'name code contactPerson phone email')
    .populate('salesOrder', 'orderNumber')
    .populate('items.item', 'name sku')
    .populate('items.uom', 'name symbol')
    .populate('createdBy', 'name');
  if (!invoice || !invoice.isActive) throw new AppError('Invoice not found', 404);
  return invoice;
}

export async function createInvoice(
  data: {
    customer: string;
    salesOrder?: string;
    items: { item: string; description?: string; qty: number; unitPrice: number; discount: number; uom: string }[];
    taxPercent: number;
    dueDate?: string;
    notes?: string;
  },
  createdBy: string,
) {
  const customer = await Customer.findById(data.customer);
  if (!customer || !customer.isActive) throw new AppError('Customer not found', 404);

  const invoiceNumber = await generateInvoiceNumber();
  const items = buildItems(data.items);
  const { subtotal, discountAmount, taxAmount, totalAmount } = calcOrderTotals(data.items, data.taxPercent);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const [invoice] = await Invoice.create(
      [{
        invoiceNumber,
        customer: data.customer,
        salesOrder: data.salesOrder,
        items,
        subtotal,
        discountAmount,
        taxPercent: data.taxPercent,
        taxAmount,
        totalAmount,
        paidAmount: 0,
        dueAmount: totalAmount,
        dueDate: data.dueDate,
        notes: data.notes,
        createdBy,
      }],
      { session },
    );

    // Increase customer balance (they owe us)
    await Customer.findByIdAndUpdate(
      data.customer,
      { $inc: { balance: totalAmount } },
      { session },
    );

    await session.commitTransaction();
    return invoice;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

// ── Customer Payments / Receipts (T47) ────────────────────────────────────────

export async function createCustomerPayment(
  data: {
    customer: string;
    invoice: string;
    amount: number;
    paymentDate?: string;
    method: string;
    reference?: string;
    notes?: string;
  },
  createdBy: string,
) {
  const [customer, invoice] = await Promise.all([
    Customer.findById(data.customer),
    Invoice.findById(data.invoice),
  ]);
  if (!customer || !customer.isActive) throw new AppError('Customer not found', 404);
  if (!invoice || !invoice.isActive) throw new AppError('Invoice not found', 404);
  if (invoice.status === 'PAID') throw new AppError('Invoice is already fully paid', 400);
  if (invoice.status === 'CANCELLED') throw new AppError('Invoice is cancelled', 400);
  if (String(invoice.customer) !== data.customer) throw new AppError('Invoice does not belong to this customer', 400);
  if (data.amount > invoice.dueAmount) {
    throw new AppError(`Payment (${data.amount}) exceeds invoice due amount (${invoice.dueAmount})`, 400);
  }

  const receiptNumber = await generateReceiptNumber();
  const newPaid = round2(invoice.paidAmount + data.amount);
  const newDue = round2(invoice.totalAmount - newPaid);
  const newStatus = newDue <= 0 ? 'PAID' : 'PARTIAL';

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const [payment] = await CustomerPayment.create(
      [{
        receiptNumber,
        customer: data.customer,
        invoice: data.invoice,
        amount: data.amount,
        paymentDate: data.paymentDate ?? new Date(),
        method: data.method,
        reference: data.reference,
        notes: data.notes,
        createdBy,
      }],
      { session },
    );

    await Invoice.findByIdAndUpdate(
      data.invoice,
      { paidAmount: newPaid, dueAmount: newDue, status: newStatus },
      { session },
    );

    // Decrease customer balance (they paid us)
    await Customer.findByIdAndUpdate(
      data.customer,
      { $inc: { balance: -data.amount } },
      { session },
    );

    await session.commitTransaction();
    return payment;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function getCustomerPayments(customerId: string, query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const [payments, total] = await Promise.all([
    CustomerPayment.find({ customer: customerId, isActive: true })
      .populate('invoice', 'invoiceNumber totalAmount')
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(limit),
    CustomerPayment.countDocuments({ customer: customerId, isActive: true }),
  ]);
  return { payments, pagination: buildPagination(page, limit, total) };
}

// ── Customer Dues (T48) ───────────────────────────────────────────────────────

export async function getCustomerDues(customerId: string) {
  const customer = await Customer.findById(customerId);
  if (!customer || !customer.isActive) throw new AppError('Customer not found', 404);

  const now = new Date();

  const [invoices, payments] = await Promise.all([
    Invoice.find({ customer: customerId, isActive: true, status: { $ne: 'CANCELLED' } })
      .populate('salesOrder', 'orderNumber')
      .sort({ createdAt: -1 })
      .select('invoiceNumber totalAmount paidAmount dueAmount status dueDate salesOrder createdAt'),
    CustomerPayment.find({ customer: customerId, isActive: true })
      .sort({ paymentDate: -1 })
      .select('receiptNumber amount paymentDate method reference'),
  ]);

  // Aging buckets: current, 1-30, 31-60, 61-90, 90+
  const aging = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, over90: 0 };
  for (const inv of invoices) {
    if (inv.dueAmount <= 0) continue;
    if (!inv.dueDate) { aging.current += inv.dueAmount; continue; }
    const days = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000);
    if (days <= 0) aging.current += inv.dueAmount;
    else if (days <= 30) aging.days1_30 += inv.dueAmount;
    else if (days <= 60) aging.days31_60 += inv.dueAmount;
    else if (days <= 90) aging.days61_90 += inv.dueAmount;
    else aging.over90 += inv.dueAmount;
  }

  return {
    customer: { _id: customer._id, name: customer.name, code: customer.code, creditLimit: customer.creditLimit },
    outstandingBalance: customer.balance,
    aging,
    invoices,
    payments,
  };
}
