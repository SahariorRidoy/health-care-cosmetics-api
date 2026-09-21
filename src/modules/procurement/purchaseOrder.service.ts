import { PurchaseOrder, POStatus } from './purchaseOrder.model';
import { GoodsReceipt } from './goodsReceipt.model';
import { Supplier } from './supplier.model';
import { Item } from '../inventory/item.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

// Auto-generate PO number: PO-YYYYMMDD-XXXX
async function generatePONumber(): Promise<string> {
  const date = new Date();
  const prefix = `PO-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const count = await PurchaseOrder.countDocuments({ poNumber: { $regex: `^${prefix}` } });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

function calcTotals(items: { orderedQty: number; unitPrice: number }[]) {
  const subtotal = items.reduce((sum, i) => sum + i.orderedQty * i.unitPrice, 0);
  return { subtotal: Math.round(subtotal * 100) / 100, totalAmount: Math.round(subtotal * 100) / 100 };
}

export async function getPurchaseOrders(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);

  const filter: Record<string, unknown> = { isActive: true };
  if (query.supplier) filter.supplier = query.supplier;
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    PurchaseOrder.find(filter)
      .populate('supplier', 'name')
      .populate('items.item', 'name sku')
      .populate('items.uom', 'name symbol')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    PurchaseOrder.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getPurchaseOrderById(id: string) {
  const po = await PurchaseOrder.findById(id)
    .populate('supplier', 'name contactPerson phone email')
    .populate('items.item', 'name sku type')
    .populate('items.uom', 'name symbol')
    .populate('createdBy', 'name');
  if (!po || !po.isActive) throw new AppError('Purchase order not found', 404);
  return po;
}

export async function createPurchaseOrder(data: {
  supplier: string;
  items: { item: string; description?: string; orderedQty: number; unitPrice: number; uom: string }[];
  paidAmount?: number;
  notes?: string;
  expectedDeliveryDate?: string;
}, createdBy: string) {
  const supplier = await Supplier.findById(data.supplier);
  if (!supplier || !supplier.isActive) throw new AppError('Supplier not found', 404);

  // Enforce: POs can only contain raw materials or packaging items
  const itemIds = data.items.map((i) => i.item);
  const items = await Item.find({ _id: { $in: itemIds } }).select('type name');
  const invalidItems = items.filter((i) => i.type !== 'RAW_MATERIAL' && i.type !== 'PACKAGING');
  if (invalidItems.length > 0) {
    const names = invalidItems.map((i) => i.name).join(', ');
    throw new AppError(
      `Purchase orders can only contain raw materials or packaging items. Invalid items: ${names}`,
      400,
    );
  }

  const poNumber = await generatePONumber();
  const { subtotal, totalAmount } = calcTotals(data.items);

  const poItems = data.items.map((i) => ({
    ...i,
    receivedQty: 0,
    totalPrice: Math.round(i.orderedQty * i.unitPrice * 100) / 100,
  }));

  const paidAmount = Math.round((data.paidAmount ?? 0) * 100) / 100;
  const paymentStatus = paidAmount >= totalAmount ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID';

  return PurchaseOrder.create({
    poNumber,
    supplier: data.supplier,
    items: poItems,
    subtotal,
    totalAmount,
    paidAmount,
    paymentStatus,
    notes: data.notes,
    expectedDeliveryDate: data.expectedDeliveryDate,
    createdBy,
  });
}

export async function updatePurchaseOrder(id: string, data: {
  items?: { item: string; description?: string; orderedQty: number; unitPrice: number; uom: string }[];
  notes?: string;
  expectedDeliveryDate?: string;
}) {
  const po = await PurchaseOrder.findById(id);
  if (!po || !po.isActive) throw new AppError('Purchase order not found', 404);
  if (po.status !== 'DRAFT') throw new AppError('Only DRAFT purchase orders can be edited', 400);

  const update: Record<string, unknown> = {};
  if (data.notes !== undefined) update.notes = data.notes;
  if (data.expectedDeliveryDate !== undefined) update.expectedDeliveryDate = data.expectedDeliveryDate;

  if (data.items) {
    const { subtotal, totalAmount } = calcTotals(data.items);
    update.items = data.items.map((i) => ({
      ...i,
      receivedQty: 0,
      totalPrice: Math.round(i.orderedQty * i.unitPrice * 100) / 100,
    }));
    update.subtotal = subtotal;
    update.totalAmount = totalAmount;
  }

  return PurchaseOrder.findByIdAndUpdate(id, update, { new: true, runValidators: true });
}

export async function updatePOPayment(id: string, paidAmount: number) {
  const po = await PurchaseOrder.findById(id);
  if (!po || !po.isActive) throw new AppError('Purchase order not found', 404);

  const rounded = Math.round(paidAmount * 100) / 100;
  const diff = rounded - (po.paidAmount ?? 0);
  const paymentStatus = rounded >= po.totalAmount ? 'PAID' : rounded > 0 ? 'PARTIAL' : 'UNPAID';

  const session = await (await import('mongoose')).default.startSession();
  session.startTransaction();
  try {
    await PurchaseOrder.findByIdAndUpdate(
      id,
      { paidAmount: rounded, paymentStatus },
      { new: true, runValidators: true, session },
    );
    if (diff !== 0) {
      await Supplier.findByIdAndUpdate(
        po.supplier,
        { $inc: { balance: -diff } },
        { session },
      );
    }
    await session.commitTransaction();
    return PurchaseOrder.findById(id).populate('supplier', 'name contactPerson phone email').populate('items.item', 'name sku type').populate('items.uom', 'name symbol');
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

// Valid status transitions
const TRANSITIONS: Record<POStatus, POStatus[]> = {
  DRAFT: ['CONFIRMED'],
  CONFIRMED: ['CLOSED'],
  RECEIVED: ['CLOSED'],
  CLOSED: [],
};

export async function updatePOStatus(id: string, newStatus: POStatus) {
  const po = await PurchaseOrder.findById(id);
  if (!po || !po.isActive) throw new AppError('Purchase order not found', 404);

  if (!TRANSITIONS[po.status].includes(newStatus)) {
    throw new AppError(`Cannot transition from ${po.status} to ${newStatus}`, 400);
  }

  po.status = newStatus;
  return po.save();
}

export async function deletePurchaseOrder(id: string) {
  const po = await PurchaseOrder.findById(id);
  if (!po || !po.isActive) throw new AppError('Purchase order not found', 404);
  await GoodsReceipt.updateMany({ purchaseOrder: id }, { isActive: false });
  po.isActive = false;
  return po.save();
}
