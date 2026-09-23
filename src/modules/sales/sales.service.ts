import mongoose from 'mongoose';
import { SalesOrder, SalesOrderStatus } from './salesOrder.model';
import { Invoice } from './invoice.model';
import { CustomerPayment } from './customerPayment.model';
import { Customer } from './customer.model';
import { Warehouse } from '../warehouse/warehouse.model';
import { Item } from '../inventory/item.model';
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
  if (query.search) {
    const customerIds = await Customer.find({
      isActive: true,
      $or: [
        { name: { $regex: query.search, $options: 'i' } },
        { phone: { $regex: query.search, $options: 'i' } },
      ],
    }).distinct('_id');
    filter.$or = [
      { orderNumber: { $regex: query.search, $options: 'i' } },
      { customer: { $in: customerIds } },
    ];
  }

  const [orders, total] = await Promise.all([
    SalesOrder.find(filter)
      .populate('customer', 'name')
      .populate('warehouse', 'name code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    SalesOrder.countDocuments(filter),
  ]);

  const orderIds = orders.map((o) => o._id);
  const invoices = await Invoice.find({ salesOrder: { $in: orderIds }, isActive: true })
    .select('salesOrder paidAmount dueAmount');
  const invoiceMap = new Map(invoices.map((inv) => [String(inv.salesOrder), inv]));

  const items = orders.map((o) => {
    const inv = invoiceMap.get(String(o._id));
    return Object.assign(o.toObject(), {
      invoiceId: inv?._id ?? null,
      paidAmount: inv?.paidAmount ?? 0,
      dueAmount: inv?.dueAmount ?? 0,
    });
  });

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getSalesOrderById(id: string) {
  const order = await SalesOrder.findById(id)
    .populate('customer', 'name phone email')
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
    status?: string;
    payment?: { amount: number; method: string; reference?: string; notes?: string };
  },
  createdBy: string,
) {
  const [customer, warehouse] = await Promise.all([
    Customer.findById(data.customer),
    Warehouse.findById(data.warehouse),
  ]);
  if (!customer || !customer.isActive) throw new AppError('Customer not found', 404);
  if (!warehouse || !warehouse.isActive) throw new AppError('Warehouse not found', 404);

  const itemIds = data.items.map((i) => i.item);
  const items = await Item.find({ _id: { $in: itemIds } }).select('type name');
  const invalidItems = items.filter((i) => i.type !== 'FINISHED_GOOD');
  if (invalidItems.length > 0) {
    const names = invalidItems.map((i) => i.name).join(', ');
    throw new AppError(`Sales orders can only contain finished products. Invalid items: ${names}`, 400);
  }

  const orderNumber = await generateOrderNumber();
  const soItems = buildItems(data.items);
  const { subtotal, discountAmount, taxAmount, totalAmount } = calcOrderTotals(data.items, data.taxPercent);
  const finalStatus: SalesOrderStatus = 'ACTIVE';

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const [order] = await SalesOrder.create([{
      orderNumber,
      customer: data.customer,
      warehouse: data.warehouse,
      items: soItems,
      subtotal,
      discountAmount,
      taxPercent: data.taxPercent,
      taxAmount,
      totalAmount,
      notes: data.notes,
      status: finalStatus,
      deliveryDate: new Date(),
      createdBy,
    }], { session });

    // Deduct stock immediately on sale
    for (const item of soItems) {
      await postMovement({
        type: 'SALES_DISPATCH',
        item: item.item,
        warehouse: data.warehouse,
        quantity: -item.qty,
        reference: orderNumber,
        referenceModel: 'SalesOrder',
        referenceId: order._id as unknown as string,
        notes: `Sale ${orderNumber}`,
        createdBy,
        session,
      });
    }

    // Auto-create invoice
    const invoiceNumber = await generateInvoiceNumber();
    const [invoice] = await Invoice.create([{
      invoiceNumber,
      customer: data.customer,
      salesOrder: order._id,
      items: soItems,
      subtotal,
      discountAmount,
      taxPercent: data.taxPercent,
      taxAmount,
      totalAmount,
      paidAmount: 0,
      dueAmount: totalAmount,
      createdBy,
    }], { session });
    await Customer.findByIdAndUpdate(data.customer, { $inc: { balance: totalAmount } }, { session });

    // Auto-record payment if provided
    if (data.payment) {
      const payAmt = data.payment.amount;
      const changeAmount = round2(Math.max(0, payAmt - totalAmount));
      const appliedAmt = round2(Math.min(payAmt, totalAmount));
      const newDue = round2(Math.max(0, totalAmount - appliedAmt));
      const invoiceStatus = appliedAmt >= totalAmount ? 'PAID' : 'PARTIAL';
      const receiptNumber = await generateReceiptNumber();
      await CustomerPayment.create([{
        receiptNumber,
        customer: data.customer,
        invoice: invoice._id,
        amount: appliedAmt,
        changeAmount,
        paymentDate: new Date(),
        method: data.payment.method,
        reference: data.payment.reference,
        notes: data.payment.notes,
        createdBy,
      }], { session });
      await Invoice.findByIdAndUpdate(
        invoice._id,
        { paidAmount: appliedAmt, dueAmount: newDue, status: invoiceStatus },
        { session },
      );
      await Customer.findByIdAndUpdate(data.customer, { $inc: { balance: -appliedAmt } }, { session });
    }

    await session.commitTransaction();
    return order;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function updateSalesOrder(
  id: string,
  data: { notes?: string },
) {
  const order = await SalesOrder.findById(id);
  if (!order || !order.isActive) throw new AppError('Sales order not found', 404);
  if (order.status !== 'ACTIVE') throw new AppError('Only active orders can be edited', 400);
  const update: Record<string, unknown> = {};
  if (data.notes !== undefined) update.notes = data.notes;
  return SalesOrder.findByIdAndUpdate(id, update, { new: true, runValidators: true });
}

export async function cancelSalesOrder(id: string) {
  const order = await SalesOrder.findById(id);
  if (!order || !order.isActive) throw new AppError('Sales order not found', 404);
  if (order.status === 'CANCELLED') throw new AppError('Order is already cancelled', 400);
  order.status = 'CANCELLED';
  return order.save();
}

export async function deleteSalesOrder(id: string) {
  const order = await SalesOrder.findById(id);
  if (!order || !order.isActive) throw new AppError('Sales order not found', 404);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await SalesOrder.findByIdAndUpdate(id, { isActive: false }, { session });

    const invoice = await Invoice.findOne({ salesOrder: id, isActive: true }).session(session);
    if (invoice) {
      if (invoice.dueAmount > 0) {
        await Customer.findByIdAndUpdate(invoice.customer, { $inc: { balance: -invoice.dueAmount } }, { session });
      }
      await CustomerPayment.updateMany({ invoice: invoice._id }, { isActive: false }, { session });
      await Invoice.findByIdAndUpdate(invoice._id, { isActive: false }, { session });
    }

    await session.commitTransaction();
    return order;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

// ── Invoices (T46) ────────────────────────────────────────────────────────────

export async function getInvoices(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = { isActive: true };
  if (query.customer) filter.customer = query.customer;
  if (query.status) filter.status = query.status;
  if (query.salesOrder) filter.salesOrder = query.salesOrder;

  if (query.search) {
    const customerIds = await Customer.find({
      isActive: true,
      $or: [
        { name: { $regex: query.search, $options: 'i' } },
        { phone: { $regex: query.search, $options: 'i' } },
      ],
    }).distinct('_id');
    filter.$or = [
      { invoiceNumber: { $regex: query.search, $options: 'i' } },
      { customer: { $in: customerIds } },
    ];
  }

  if (query.dateFrom || query.dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (query.dateFrom) dateFilter.$gte = new Date(query.dateFrom as string);
    if (query.dateTo) {
      const to = new Date(query.dateTo as string);
      to.setHours(23, 59, 59, 999);
      dateFilter.$lte = to;
    }
    filter.createdAt = dateFilter;
  }

  const [items, total] = await Promise.all([
    Invoice.find(filter)
      .populate('customer', 'name')
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
    .populate('customer', 'name phone email')
    .populate('salesOrder', 'orderNumber')
    .populate('items.item', 'name sku')
    .populate('items.uom', 'name symbol')
    .populate('createdBy', 'name');
  if (!invoice || !invoice.isActive) throw new AppError('Invoice not found', 404);
  return invoice;
}

export async function deleteInvoice(id: string) {
  const invoice = await Invoice.findById(id);
  if (!invoice || !invoice.isActive) throw new AppError('Invoice not found', 404);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Reverse whatever balance remains (paid portion already cleared, reverse due)
    if (invoice.dueAmount > 0) {
      await Customer.findByIdAndUpdate(invoice.customer, { $inc: { balance: -invoice.dueAmount } }, { session });
    }
    await CustomerPayment.updateMany({ invoice: invoice._id }, { isActive: false }, { session });
    invoice.isActive = false;
    await invoice.save({ session });
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
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

  const changeAmount = round2(Math.max(0, data.amount - invoice.dueAmount));
  const appliedAmt = round2(Math.min(data.amount, invoice.dueAmount));
  const receiptNumber = await generateReceiptNumber();
  const newPaid = round2(invoice.paidAmount + appliedAmt);
  const newDue = round2(Math.max(0, invoice.totalAmount - newPaid));
  const invoiceStatus = newPaid >= invoice.totalAmount ? 'PAID' : 'PARTIAL';

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const [payment] = await CustomerPayment.create(
      [{
        receiptNumber,
        customer: data.customer,
        invoice: data.invoice,
        amount: appliedAmt,
        changeAmount,
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
      { paidAmount: newPaid, dueAmount: newDue, status: invoiceStatus },
      { session },
    );

    // Decrease customer balance (they paid us)
    await Customer.findByIdAndUpdate(
      data.customer,
      { $inc: { balance: -appliedAmt } },
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

export async function getAllPayments(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = { isActive: true };
  if (query.method) filter.method = query.method;

  if (query.search) {
    const customerIds = await Customer.find({
      isActive: true,
      $or: [
        { name: { $regex: query.search, $options: 'i' } },
        { phone: { $regex: query.search, $options: 'i' } },
      ],
    }).distinct('_id');
    filter.$or = [
      { receiptNumber: { $regex: query.search, $options: 'i' } },
      { customer: { $in: customerIds } },
    ];
  }

  if (query.dateFrom || query.dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (query.dateFrom) dateFilter.$gte = new Date(query.dateFrom as string);
    if (query.dateTo) {
      const to = new Date(query.dateTo as string);
      to.setHours(23, 59, 59, 999);
      dateFilter.$lte = to;
    }
    filter.paymentDate = dateFilter;
  }

  const [payments, total] = await Promise.all([
    CustomerPayment.find(filter)
      .populate('customer', 'name')
      .populate('invoice', 'invoiceNumber totalAmount')
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(limit),
    CustomerPayment.countDocuments(filter),
  ]);
  return { payments, pagination: buildPagination(page, limit, total) };
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

export async function getPaymentById(id: string) {
  const payment = await CustomerPayment.findById(id)
    .populate('customer', 'name phone email address')
    .populate('invoice', 'invoiceNumber totalAmount paidAmount dueAmount status')
    .populate('createdBy', 'name');
  if (!payment || !payment.isActive) throw new AppError('Payment not found', 404);
  return payment;
}

export async function deletePayment(id: string) {
  const payment = await CustomerPayment.findById(id);
  if (!payment || !payment.isActive) throw new AppError('Payment not found', 404);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    payment.isActive = false;
    await payment.save({ session });

    // Reverse the invoice paid/due amounts
    const invoice = await Invoice.findById(payment.invoice).session(session);
    if (invoice && invoice.isActive) {
      const newPaid = round2(Math.max(0, invoice.paidAmount - payment.amount));
      const newDue = round2(invoice.totalAmount - newPaid);
      const newStatus = newPaid <= 0 ? 'UNPAID' : 'PARTIAL';
      await Invoice.findByIdAndUpdate(
        invoice._id,
        { paidAmount: newPaid, dueAmount: newDue, status: newStatus },
        { session },
      );
    }

    // Restore customer balance (they owe us again)
    await Customer.findByIdAndUpdate(payment.customer, { $inc: { balance: payment.amount } }, { session });

    await session.commitTransaction();
    return payment;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
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
    customer: { _id: customer._id, name: customer.name },
    outstandingBalance: customer.balance,
    aging,
    invoices,
    payments,
  };
}
