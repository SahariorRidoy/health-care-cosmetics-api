import mongoose from 'mongoose';
import { Item, ItemType } from './item.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';
import { PurchaseOrder } from '../procurement/purchaseOrder.model';
import { GoodsReceipt } from '../procurement/goodsReceipt.model';
import { Supplier } from '../procurement/supplier.model';
import { Warehouse } from '../warehouse/warehouse.model';
import { postMovement } from './stock.service';
import { convertQty } from './uom.service';
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
      .populate('materials.item', 'name')
      .populate('materials.uom', 'name symbol')
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
    .populate('supplier', 'name phone email contactPerson')
    .populate('materials.item', 'name costPrice baseUom')
    .populate('materials.uom', 'name symbol');
  if (!item) throw new AppError('Item not found', 404);
  return item;
}

export async function createItem(data: {
  name: string; sku?: string; type: ItemType;
  description?: string; baseUom: string;
  supplier?: string; unitPrice?: number; quantity?: number;
  warehouse?: string; costPrice?: number; salePrice?: number;
  notes?: string; expectedDeliveryDate?: string; paidAmount?: number;
  materials?: { item: string; qty: number; uom: string; warehouse: string }[];
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

    // Deduct input materials from stock with UOM conversion
    if (data.materials && data.materials.length > 0) {
      for (const mat of data.materials) {
        if (!mat.item || !mat.qty || mat.qty <= 0) continue;
        const matItem = await Item.findById(mat.item).select('baseUom name');
        if (!matItem) throw new AppError(`Material item ${mat.item} not found`, 404);

        // Convert usage qty (mat.uom) → item's baseUom for stock deduction
        let deductQty = mat.qty;
        if (mat.uom && String(mat.uom) !== String(matItem.baseUom)) {
          try {
            deductQty = await convertQty(mat.qty, mat.uom, String(matItem.baseUom));
          } catch { /* same unit or no conversion — use as-is */ }
        }
        deductQty = Math.round(deductQty * 1000000) / 1000000;

        await postMovement({
          type: 'PRODUCTION_ISSUE',
          item: mat.item,
          warehouse: mat.warehouse ?? data.warehouse!,
          quantity: -deductQty,
          reference: item.sku,
          usageQty: mat.qty,
          usageUom: mat.uom,
          notes: `Material consumed for production of ${data.name}`,
          createdBy: userId,
        });
      }
    }

    await postMovement({
      type: 'PRODUCTION_OUTPUT',
      item: String(item._id),
      warehouse: data.warehouse,
      quantity: data.quantity,
      reference: item.sku,
      notes: `Initial production of ${data.name}`,
      createdBy: userId,
    });

    const filledMats = (data.materials ?? []).filter((m) => m.item && m.qty > 0);
    await Item.findByIdAndUpdate(item._id, {
      currentStock: data.quantity,
      materials: filledMats.map((m) => ({ item: m.item, qty: m.qty, uom: m.uom })),
    });

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
    const paidAmount = Math.round((data.paidAmount ?? 0) * 100) / 100;
    const paymentStatus = paidAmount >= totalAmount ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID';

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
        paidAmount,
        paymentStatus,
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
  quantity: number; warehouse: string;
  materials: { item: string; qty: number; uom: string; warehouse: string }[];
}>, userId: string) {
  if (data.sku) data.sku = data.sku.toUpperCase();
  const { quantity, warehouse, materials, ...itemFields } = data;

  // update item metadata first
  const item = await Item.findByIdAndUpdate(id, itemFields, { new: true, runValidators: true })
    .populate('baseUom', 'name symbol')
    .populate('supplier', 'name');
  if (!item) throw new AppError('Item not found', 404);

  // if production fields provided: reconcile materials and output against current state
  if (quantity !== undefined && quantity > 0 && warehouse && materials !== undefined) {
    // save current material list directly on the item
    const filledMats = materials.filter((m) => m.item && m.qty > 0);
    await Item.findByIdAndUpdate(id, {
      materials: filledMats.map((m) => ({ item: m.item, qty: m.qty, uom: m.uom })),
    });

    const wh = await Warehouse.findById(warehouse);
    if (!wh || !wh.isActive) throw new AppError('Warehouse not found', 404);

    const { StockMovement } = await import('./stock.model');

    // build map of new desired qty per material (in baseUom)
    const newMatMap = new Map<string, { qty: number; uom: string; warehouse: string }>();
    for (const mat of materials) {
      if (!mat.item || !mat.qty || mat.qty <= 0) continue;
      const matItem = await Item.findById(mat.item).select('baseUom name');
      if (!matItem) throw new AppError(`Material item ${mat.item} not found`, 404);
      let baseQty = mat.qty;
      if (mat.uom && String(mat.uom) !== String(matItem.baseUom)) {
        try { baseQty = await convertQty(mat.qty, mat.uom, String(matItem.baseUom)); } catch { /* use as-is */ }
      }
      newMatMap.set(String(mat.item), {
        qty: Math.round(baseQty * 1000000) / 1000000,
        uom: mat.uom,
        warehouse: mat.warehouse ?? warehouse,
      });
    }

    // build map of previously issued qty per material (net: issues - returns)
    const allOldIssues = await StockMovement.find({ type: 'PRODUCTION_ISSUE', reference: item.sku });
    const oldMatMap = new Map<string, number>();
    for (const mv of allOldIssues) {
      const key = String(mv.item);
      // quantity is negative for deductions, positive for returns — net issued = sum of negatives
      oldMatMap.set(key, Math.round(((oldMatMap.get(key) ?? 0) + Math.abs(mv.quantity)) * 1000000) / 1000000);
    }

    // collect all item ids from both old and new
    const allItemIds = new Set([...oldMatMap.keys(), ...newMatMap.keys()]);

    for (const itemId of allItemIds) {
      const oldQty = oldMatMap.get(itemId) ?? 0;
      const newEntry = newMatMap.get(itemId);
      const newQty = newEntry?.qty ?? 0;
      const delta = newQty - oldQty; // positive = need to deduct more, negative = return excess
      if (Math.abs(delta) < 0.000001) continue;

      // find uom from new entry or fall back to old movement
      const uomId = newEntry?.uom ?? String(allOldIssues.find((mv) => String(mv.item) === itemId)?.usageUom ?? '');
      const whId = newEntry?.warehouse ?? warehouse;

      await postMovement({
        type: 'PRODUCTION_ISSUE',
        item: itemId,
        warehouse: whId,
        quantity: -delta,           // negative = deduct, positive = return
        reference: item.sku,
        usageQty: Math.abs(delta),
        usageUom: uomId,
        notes: `Material adjustment for production of ${item.name}`,
        createdBy: userId,
      });
    }

    // reconcile output stock
    const outputDelta = quantity - (item.currentStock ?? 0);
    if (Math.abs(outputDelta) >= 0.000001) {
      await postMovement({
        type: 'PRODUCTION_OUTPUT',
        item: id,
        warehouse,
        quantity: outputDelta,
        reference: item.sku,
        notes: `Production output adjustment for ${item.name}`,
        createdBy: userId,
      });
    }
  }

  return await Item.findById(id).populate('baseUom', 'name symbol').populate('supplier', 'name');
}

export async function deleteItem(id: string) {
  const item = await Item.findById(id);
  if (!item) throw new AppError('Item not found', 404);

  await Item.findByIdAndUpdate(id, { isActive: false });
  return item;
}
