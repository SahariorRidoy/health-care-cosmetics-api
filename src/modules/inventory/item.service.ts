import mongoose from 'mongoose';
import { Item, ItemType } from './item.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';
import { PurchaseOrder } from '../procurement/purchaseOrder.model';
import { GoodsReceipt } from '../procurement/goodsReceipt.model';
import { Supplier } from '../procurement/supplier.model';
import { Warehouse } from '../warehouse/warehouse.model';
import { postMovement } from './stock.service';
import { Batch } from './batch.model';

export async function generateSKU(name: string): Promise<string> {
  const base = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join('');

  // Find highest existing suffix for this base
  const existing = await Item.find({ sku: { $regex: `^${base}-` } }).select('sku');
  let max = 0;
  for (const doc of existing) {
    const parts = doc.sku.split('-');
    const num = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(num) && num > max) max = num;
  }

  return `${base}-${String(max + 1).padStart(3, '0')}`;
}

async function generatePONumber(): Promise<string> {
  const date = new Date();
  const prefix = `PO-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const count = await PurchaseOrder.countDocuments({ poNumber: { $regex: `^${prefix}` } });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

async function generateGRNumber(): Promise<string> {
  const date = new Date();
  const prefix = `GR-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const count = await GoodsReceipt.countDocuments({ grNumber: { $regex: `^${prefix}` } });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

export async function getItems(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);

  const filter: Record<string, unknown> = { isActive: true };
  if (query.search) filter.$text = { $search: String(query.search) };
  if (query.type) filter.type = query.type;
  if (query.supplier) filter.supplier = query.supplier;

  const [items, total] = await Promise.all([
    Item.find(filter)
      .populate('baseUom', 'name symbol')
      .populate('supplier', 'name')
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit),
    Item.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getItemById(id: string) {
  const item = await Item.findById(id)
    .populate('baseUom', 'name symbol')
    .populate('supplier', 'name phone email contactPerson');
  if (!item) throw new AppError('Item not found', 404);
  return item;
}

export async function createItem(data: {
  name: string; sku?: string; type: ItemType;
  description?: string; baseUom: string;
  supplier?: string; unitPrice?: number; quantity?: number;
  warehouse?: string; costPrice?: number; salePrice?: number;
  notes?: string; expectedDeliveryDate?: string;
}, userId: string) {
  const sku = data.sku ? data.sku.toUpperCase() : await generateSKU(data.name);
  const exists = await Item.findOne({ sku });
  if (exists) throw new AppError('Item with this SKU already exists', 409);

  // FINISHED_GOOD from production — create item and post initial stock
  if (data.type === 'FINISHED_GOOD') {
    if (!data.warehouse) throw new AppError('Warehouse is required', 400);
    if (!data.quantity || data.quantity <= 0) throw new AppError('Output quantity is required', 400);

    const warehouse = await Warehouse.findById(data.warehouse);
    if (!warehouse || !warehouse.isActive) throw new AppError('Warehouse not found', 404);

    const item = await Item.create({
      name: data.name,
      sku,
      type: data.type,
      description: data.description,
      baseUom: data.baseUom,
      costPrice: data.costPrice ?? 0,
      salePrice: data.salePrice,
      createdBy: userId,
    });

    await postMovement({
      type: 'PRODUCTION_OUTPUT',
      item: String(item._id),
      warehouse: data.warehouse,
      quantity: data.quantity,
      reference: item.sku,
      notes: `Initial production of ${data.name}`,
      createdBy: userId,
    });

    // Ensure currentStock is set correctly
    await Item.findByIdAndUpdate(item._id, { currentStock: data.quantity });

    return await Item.findById(item._id).populate('baseUom', 'name symbol');
  }

  // RAW_MATERIAL / PACKAGING — purchase flow
  if (!data.supplier) throw new AppError('Supplier is required', 400);
  if (data.unitPrice === undefined) throw new AppError('Unit price is required', 400);
  if (!data.quantity) throw new AppError('Quantity is required', 400);
  if (!data.warehouse) throw new AppError('Warehouse is required', 400);

  const supplier = await Supplier.findById(data.supplier);
  if (!supplier || !supplier.isActive) throw new AppError('Supplier not found', 404);

  const warehouse = await Warehouse.findById(data.warehouse);
  if (!warehouse || !warehouse.isActive) throw new AppError('Warehouse not found', 404);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [item] = await Item.create(
      [{
        name: data.name,
        sku,
        type: data.type,
        description: data.description,
        baseUom: data.baseUom,
        supplier: data.supplier,
        costPrice: data.costPrice ?? data.unitPrice,
        lastPurchasePrice: data.unitPrice,
        salePrice: data.salePrice,
        createdBy: userId,
      }],
      { session },
    );

    const totalAmount = Math.round(data.quantity * data.unitPrice * 100) / 100;

    const poNumber = await generatePONumber();
    const [po] = await PurchaseOrder.create(
      [{
        poNumber,
        supplier: data.supplier,
        status: 'CONFIRMED',
        items: [{
          item: item._id,
          orderedQty: data.quantity,
          receivedQty: data.quantity,
          unitPrice: data.unitPrice,
          totalPrice: totalAmount,
          uom: data.baseUom,
        }],
        subtotal: totalAmount,
        totalAmount,
        notes: data.notes,
        expectedDeliveryDate: data.expectedDeliveryDate,
        createdBy: userId,
      }],
      { session },
    );

    const grNumber = await generateGRNumber();
    const [gr] = await GoodsReceipt.create(
      [{
        grNumber,
        purchaseOrder: po._id,
        supplier: data.supplier,
        warehouse: data.warehouse,
        items: [{
          item: item._id,
          orderedQty: data.quantity,
          receivedQty: data.quantity,
          unitPrice: data.unitPrice,
          totalPrice: totalAmount,
          uom: data.baseUom,
        }],
        totalAmount,
        notes: data.notes,
        receivedDate: new Date(),
        createdBy: userId,
      }],
      { session },
    );

    await PurchaseOrder.findByIdAndUpdate(po._id, { status: 'RECEIVED' }, { session });

    await postMovement({
      type: 'PURCHASE_RECEIPT',
      item: String(item._id),
      warehouse: data.warehouse,
      quantity: data.quantity,
      reference: grNumber,
      referenceModel: 'GoodsReceipt',
      referenceId: String(gr._id),
      notes: `Initial purchase from ${supplier.name}`,
      createdBy: userId,
      session,
    });

    await Supplier.findByIdAndUpdate(
      data.supplier,
      { $inc: { balance: totalAmount } },
      { session },
    );

    await session.commitTransaction();

    return await Item.findById(item._id)
      .populate('baseUom', 'name symbol')
      .populate('supplier', 'name');
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function updateItem(id: string, data: Partial<{
  name: string; sku: string; type: ItemType;
  description: string; baseUom: string; supplier: string;
  costPrice: number; salePrice: number; isActive: boolean;
}>) {
  if (data.sku) data.sku = data.sku.toUpperCase();
  const item = await Item.findByIdAndUpdate(id, data, { new: true, runValidators: true })
    .populate('baseUom', 'name symbol')
    .populate('supplier', 'name');
  if (!item) throw new AppError('Item not found', 404);
  return item;
}

export async function deleteItem(id: string) {
  const item = await Item.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!item) throw new AppError('Item not found', 404);
  return item;
}
