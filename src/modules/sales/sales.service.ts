import mongoose from 'mongoose';
import { SalesOrder, SalesOrderStatus } from './salesOrder.model';
import { Invoice } from './invoice.model';
import { CustomerPayment } from './customerPayment.model';
import { Dealer } from './dealer.model';
import { Warehouse } from '../warehouse/warehouse.model';
import { Item } from '../inventory/item.model';
import { postMovement } from '../inventory/stock.service';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number) { return Math.round(n * 100) / 100; }

interface RawItem {
  item: string;
  description?: string;
  qty: number;
  giftQty?: number;
  unitPrice: number;
  commissionRate: number;
  uom: string;
}

function buildItems(rawItems: RawItem[]) {
  return rawItems.map((i) => {
    const commissionAmount = round2(i.qty * i.unitPrice * (i.commissionRate / 100));
    const lineTotal = round2(i.qty * i.unitPrice - commissionAmount);
    return {
      item: i.item,
      description: i.description,
      qty: i.qty,
      giftQty: i.giftQty ?? 0,
      unitPrice: i.unitPrice,
      commissionRate: i.commissionRate,
      commissionAmount,
      lineTotal,
      uom: i.uom,
    };
  });
}

function calcTotals(
  items: ReturnType<typeof buildItems>,
  taxPercent: number,
) {
  const grossAmount = round2(items.reduce((s, i) => s + i.qty * i.unitPrice, 0));
  const totalCommission = round2(items.reduce((s, i) => s + i.commissionAmount, 0));
  const subtotal = round2(grossAmount - totalCommission);
  const taxAmount = round2(subtotal * (taxPercent / 100));
  const totalAmount = round2(subtotal + taxAmount);
  return { grossAmount, totalCommission, subtotal, taxAmount, totalAmount };
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

// ── Sales Orders ──────────────────────────────────────────────────────────────

export async function getSalesOrders(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = { isActive: true };
  if (query.dealer) filter.dealer = query.dealer;
  if (query.status) filter.status = query.status;
  if (query.search) {
    const dealerIds = await Dealer.find({
      isActive: true,
      $or: [
        { name: { $regex: query.search, $options: 'i' } },
        { phone: { $regex: query.search, $options: 'i' } },
      ],
    }).distinct('_id');
    filter.$or = [
      { orderNumber: { $regex: query.search, $options: 'i' } },
      { dealer: { $in: dealerIds } },
    ];
  }

  const [orders, total] = await Promise.all([
    SalesOrder.find(filter)
      .populate('dealer', 'name')
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
    .populate('dealer', 'name phone email commissionRate')
    .populate('warehouse', 'name code')
    .populate('items.item', 'name sku type')
    .populate('items.uom', 'name symbol')
    .populate('createdBy', 'name');
  if (!order || !order.isActive) throw new AppError('Sales order not found', 404);
  return order;
}

export async function createSalesOrder(
  data: {
    dealer: string;
    warehouse: string;
    items: RawItem[];
    taxPercent: number;
    commissionRate: number;
    notes?: string;
    status?: string;
    payment?: { amount: number; method: string; reference?: string; notes?: string };
  },
  createdBy: string,
) {
  const [dealer, warehouse] = await Promise.all([
    Dealer.findById(data.dealer),
    Warehouse.findById(data.warehouse),
  ]);
  if (!dealer || !dealer.isActive) throw new AppError('Dealer not found', 404);
  if (!warehouse || !warehouse.isActive) throw new AppError('Warehouse not found', 404);

  const itemIds = data.items.map((i) => i.item);
  const dbItems = await Item.find({ _id: { $in: itemIds } }).select('type name');
  const invalidItems = dbItems.filter((i) => i.type !== 'FINISHED_GOOD');
  if (invalidItems.length > 0) {
    throw new AppError(`Sales orders can only contain finished products. Invalid items: ${invalidItems.map((i) => i.name).join(', ')}`, 400);
  }

  const orderNumber = await generateOrderNumber();
  const soItems = buildItems(data.items);
  const { grossAmount, totalCommission, subtotal, taxAmount, totalAmount } = calcTotals(soItems, data.taxPercent);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const [order] = await SalesOrder.create([{
      orderNumber,
      dealer: data.dealer,
      warehouse: data.warehouse,
      items: soItems,
      grossAmount,
      totalCommission,
      subtotal,
      taxPercent: data.taxPercent,
      taxAmount,
      totalAmount,
      commissionRate: data.commissionRate,
      commissionAmount: totalCommission,
      notes: data.notes,
      status: 'ACTIVE',
      deliveryDate: new Date(),
      createdBy,
    }], { session });

    // Deduct paid qty stock
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
      // Deduct gift qty stock separately
      if (item.giftQty > 0) {
        await postMovement({
          type: 'GIFT_DISPATCH',
          item: item.item,
          warehouse: data.warehouse,
          quantity: -item.giftQty,
          reference: orderNumber,
          referenceModel: 'SalesOrder',
          referenceId: order._id as unknown as string,
          notes: `Gift ${orderNumber}`,
          createdBy,
          session,
        });
      }
    }

    // Auto-create invoice
    const invoiceNumber = await generateInvoiceNumber();
    const [invoice] = await Invoice.create([{
      invoiceNumber,
      dealer: data.dealer,
      salesOrder: order._id,
      items: soItems,
      grossAmount,
      totalCommission,
      subtotal,
      taxPercent: data.taxPercent,
      taxAmount,
      totalAmount,
      paidAmount: 0,
      dueAmount: totalAmount,
      commissionRate: data.commissionRate,
      commissionAmount: totalCommission,
      createdBy,
    }], { session });
    await Dealer.findByIdAndUpdate(data.dealer, { $inc: { balance: totalAmount } }, { session });

    if (data.payment && data.payment.amount > 0) {
      const payAmt = data.payment.amount;
      const appliedAmt = round2(Math.min(payAmt, totalAmount));
      const changeAmount = round2(Math.max(0, payAmt - totalAmount));
      const newDue = round2(Math.max(0, totalAmount - appliedAmt));
      const invoiceStatus = appliedAmt >= totalAmount ? 'PAID' : 'PARTIAL';
      const receiptNumber = await generateReceiptNumber();
      await CustomerPayment.create([{
        receiptNumber,
        dealer: data.dealer,
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
      await Dealer.findByIdAndUpdate(data.dealer, { $inc: { balance: -appliedAmt } }, { session });
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
        await Dealer.findByIdAndUpdate(invoice.dealer, { $inc: { balance: -invoice.dueAmount } }, { session });
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

// ── Invoices ──────────────────────────────────────────────────────────────────

export async function getInvoices(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = { isActive: true };
  if (query.dealer) filter.dealer = query.dealer;
  if (query.status) filter.status = query.status;
  if (query.salesOrder) filter.salesOrder = query.salesOrder;

  if (query.search) {
    const dealerIds = await Dealer.find({
      isActive: true,
      $or: [
        { name: { $regex: query.search, $options: 'i' } },
        { phone: { $regex: query.search, $options: 'i' } },
      ],
    }).distinct('_id');
    filter.$or = [
      { invoiceNumber: { $regex: query.search, $options: 'i' } },
      { dealer: { $in: dealerIds } },
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
      .populate('dealer', 'name')
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
    .populate('dealer', 'name phone email')
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
    if (invoice.dueAmount > 0) {
      await Dealer.findByIdAndUpdate(invoice.dealer, { $inc: { balance: -invoice.dueAmount } }, { session });
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
    dealer: string;
    salesOrder?: string;
    items: RawItem[];
    taxPercent: number;
    commissionRate: number;
    dueDate?: string;
    notes?: string;
  },
  createdBy: string,
) {
  const dealer = await Dealer.findById(data.dealer);
  if (!dealer || !dealer.isActive) throw new AppError('Dealer not found', 404);

  const invoiceNumber = await generateInvoiceNumber();
  const items = buildItems(data.items);
  const { grossAmount, totalCommission, subtotal, taxAmount, totalAmount } = calcTotals(items, data.taxPercent);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const [invoice] = await Invoice.create(
      [{
        invoiceNumber,
        dealer: data.dealer,
        salesOrder: data.salesOrder,
        items,
        grossAmount,
        totalCommission,
        subtotal,
        taxPercent: data.taxPercent,
        taxAmount,
        totalAmount,
        paidAmount: 0,
        dueAmount: totalAmount,
        commissionRate: data.commissionRate,
        commissionAmount: totalCommission,
        dueDate: data.dueDate,
        notes: data.notes,
        createdBy,
      }],
      { session },
    );

    await Dealer.findByIdAndUpdate(
      data.dealer,
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

export async function updateInvoice(
  id: string,
  data: { notes?: string; dueDate?: string },
) {
  const invoice = await Invoice.findById(id);
  if (!invoice || !invoice.isActive) throw new AppError('Invoice not found', 404);
  const update: Record<string, unknown> = {};
  if (data.notes !== undefined) update.notes = data.notes;
  if (data.dueDate !== undefined) update.dueDate = data.dueDate;
  return Invoice.findByIdAndUpdate(id, update, { new: true, runValidators: true });
}

// ── Dealer Payments / Receipts ────────────────────────────────────────────────

export async function createCustomerPayment(
  data: {
    dealer: string;
    invoice: string;
    amount: number;
    paymentDate?: string;
    method: string;
    reference?: string;
    notes?: string;
  },
  createdBy: string,
) {
  const [dealer, invoice] = await Promise.all([
    Dealer.findById(data.dealer),
    Invoice.findById(data.invoice),
  ]);
  if (!dealer || !dealer.isActive) throw new AppError('Dealer not found', 404);
  if (!invoice || !invoice.isActive) throw new AppError('Invoice not found', 404);
  if (invoice.status === 'PAID') throw new AppError('Invoice is already fully paid', 400);
  if (invoice.status === 'CANCELLED') throw new AppError('Invoice is cancelled', 400);
  if (String(invoice.dealer) !== data.dealer) throw new AppError('Invoice does not belong to this dealer', 400);

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
        dealer: data.dealer,
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

    await Dealer.findByIdAndUpdate(
      data.dealer,
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
    const dealerIds = await Dealer.find({
      isActive: true,
      $or: [
        { name: { $regex: query.search, $options: 'i' } },
        { phone: { $regex: query.search, $options: 'i' } },
      ],
    }).distinct('_id');
    filter.$or = [
      { receiptNumber: { $regex: query.search, $options: 'i' } },
      { dealer: { $in: dealerIds } },
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
      .populate('dealer', 'name')
      .populate('invoice', 'invoiceNumber totalAmount')
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(limit),
    CustomerPayment.countDocuments(filter),
  ]);
  return { payments, pagination: buildPagination(page, limit, total) };
}

export async function getCustomerPayments(dealerId: string, query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const [payments, total] = await Promise.all([
    CustomerPayment.find({ dealer: dealerId, isActive: true })
      .populate('invoice', 'invoiceNumber totalAmount')
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(limit),
    CustomerPayment.countDocuments({ dealer: dealerId, isActive: true }),
  ]);
  return { payments, pagination: buildPagination(page, limit, total) };
}

export async function getPaymentById(id: string) {
  const payment = await CustomerPayment.findById(id)
    .populate('dealer', 'name phone email address')
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

    await Dealer.findByIdAndUpdate(payment.dealer, { $inc: { balance: payment.amount } }, { session });

    await session.commitTransaction();
    return payment;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

// ── Dealer Dues ───────────────────────────────────────────────────────────────

export async function getCustomerDues(dealerId: string) {
  const dealer = await Dealer.findById(dealerId);
  if (!dealer || !dealer.isActive) throw new AppError('Dealer not found', 404);

  const now = new Date();

  const [invoices, payments] = await Promise.all([
    Invoice.find({ dealer: dealerId, isActive: true, status: { $ne: 'CANCELLED' } })
      .populate('salesOrder', 'orderNumber')
      .sort({ createdAt: -1 })
      .select('invoiceNumber grossAmount totalCommission totalAmount paidAmount dueAmount status dueDate salesOrder createdAt commissionRate commissionAmount'),
    CustomerPayment.find({ dealer: dealerId, isActive: true })
      .sort({ paymentDate: -1 })
      .select('receiptNumber amount paymentDate method reference'),
  ]);

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

  const totalGrossAmount = invoices.reduce((s, inv) => s + (inv.grossAmount ?? inv.totalAmount), 0);
  const totalCommission = invoices.reduce((s, inv) => s + (inv.totalCommission ?? inv.commissionAmount), 0);
  const totalNetAmount = invoices.reduce((s, inv) => s + inv.totalAmount, 0);

  return {
    dealer: { _id: dealer._id, name: dealer.name, commissionRate: dealer.commissionRate },
    outstandingBalance: dealer.balance,
    totalGrossAmount,
    totalCommission,
    totalNetAmount,
    aging,
    invoices,
    payments,
  };
}

export async function updateCustomerPayment(
  id: string,
  data: { amount?: number; paymentDate?: string; method?: string; reference?: string; notes?: string },
) {
  const payment = await CustomerPayment.findById(id);
  if (!payment || !payment.isActive) throw new AppError('Payment not found', 404);
  const update: Record<string, unknown> = {};
  if (data.amount !== undefined) update.amount = data.amount;
  if (data.paymentDate !== undefined) update.paymentDate = data.paymentDate;
  if (data.method !== undefined) update.method = data.method;
  if (data.reference !== undefined) update.reference = data.reference;
  if (data.notes !== undefined) update.notes = data.notes;
  return CustomerPayment.findByIdAndUpdate(id, update, { new: true, runValidators: true });
}
