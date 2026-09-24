import mongoose, { Types } from 'mongoose';
import { FactoryBatch } from './factoryBatch.model';
import { Item } from '../inventory/item.model';
import { Warehouse } from '../warehouse/warehouse.model';
import { postMovement } from '../inventory/stock.service';
import { generateSKU } from '../inventory/item.service';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

// ── Number generators ─────────────────────────────────────────────────────────

async function generateFBNumber(): Promise<string> {
  const d = new Date();
  const prefix = `FB-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const count = await FactoryBatch.countDocuments({ fbNumber: { $regex: `^${prefix}` } });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

async function generateReceiptNumber(batchId: string): Promise<string> {
  const d = new Date();
  const prefix = `FPR-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const batch = await FactoryBatch.findById(batchId);
  const count = (batch?.receipts.length ?? 0) + 1;
  return `${prefix}-${String(count).padStart(4, '0')}`;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getFactoryBatches(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = { isActive: true };
  if (query.status) filter.status = query.status;
  if (query.search) {
    const regex = { $regex: String(query.search), $options: 'i' };
    filter.$or = [{ fbNumber: regex }, { batchName: regex }];
  }

  const [items, total] = await Promise.all([
    FactoryBatch.find(filter)
      .populate('warehouse', 'name code')
      .populate('dispatch.materials.item', 'name sku costPrice')
      .populate('dispatch.materials.uom', 'name symbol')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    FactoryBatch.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getFactoryBatchById(id: string) {
  const batch = await FactoryBatch.findById(id)
    .populate('warehouse', 'name code')
    .populate('dispatch.materials.item', 'name sku costPrice')
    .populate('dispatch.materials.uom', 'name symbol')
    .populate('receipts.products.linkedItem', 'name sku')
    .populate('receipts.products.uom', 'name symbol')
    .populate('receipts.products.materialsUsed.item', 'name sku costPrice')
    .populate('receipts.products.materialsUsed.uom', 'name symbol')
    .populate('receipts.createdBy', 'name')
    .populate('materialReturns.materials.item', 'name sku')
    .populate('materialReturns.materials.uom', 'name symbol')
    .populate('materialReturns.createdBy', 'name')
    .populate('restockHistory.materials.item', 'name sku')
    .populate('restockHistory.materials.uom', 'name symbol')
    .populate('restockHistory.createdBy', 'name')
    .populate('createdBy', 'name');

  if (!batch || !batch.isActive) throw new AppError('Factory batch not found', 404);
  return batch;
}

export async function getFactoryLedger(factoryId: string) {
  const factory = await Warehouse.findById(factoryId);
  if (!factory) throw new AppError('Factory not found', 404);

  const batches = await FactoryBatch.find({ isActive: true })
    .populate('warehouse', 'name code')
    .populate('dispatch.materials.item', 'name sku')
    .populate('dispatch.materials.uom', 'name symbol')
    .populate('receipts.products.materialsUsed.item', 'name sku')
    .populate('materialReturns.materials.item', 'name sku')
    .sort({ createdAt: -1 });

  // Derive factory stock per material across all batches
  const stockMap: Record<string, { item: unknown; dispatched: number; used: number; returned: number }> = {};

  for (const batch of batches) {
    // Add dispatched
    for (const mat of batch.dispatch.materials) {
      const key = String(mat.item);
      if (!stockMap[key]) stockMap[key] = { item: mat.item, dispatched: 0, used: 0, returned: 0 };
      stockMap[key].dispatched += mat.dispatchedQty;
    }
    // Subtract used
    for (const receipt of batch.receipts) {
      for (const product of receipt.products) {
        for (const mu of product.materialsUsed) {
          const key = String(mu.item);
          if (!stockMap[key]) stockMap[key] = { item: mu.item, dispatched: 0, used: 0, returned: 0 };
          stockMap[key].used += mu.usedQty;
        }
      }
    }
    // Subtract returned
    for (const ret of batch.materialReturns) {
      for (const mat of ret.materials) {
        const key = String(mat.item);
        if (!stockMap[key]) stockMap[key] = { item: mat.item, dispatched: 0, used: 0, returned: 0 };
        stockMap[key].returned += mat.returnedQty;
      }
    }
  }

  const factoryStock = Object.values(stockMap).map((s) => ({
    ...s,
    remaining: Math.max(0, s.dispatched - s.used - s.returned),
  }));

  return { factory, batches, factoryStock };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function createFactoryBatch(data: {
  batchName: string;
  warehouse: string;
  dispatch: { materials: { item: string; qty: number; uom: string }[]; notes?: string };
  expectedDeliveryDate?: string;
  notes?: string;
}, createdBy: string) {
  const warehouse = await Warehouse.findById(data.warehouse);
  if (!warehouse || !warehouse.isActive) throw new AppError('Warehouse not found', 404);

  for (const mat of data.dispatch.materials) {
    const itemDoc = await Item.findById(mat.item);
    if (!itemDoc || !itemDoc.isActive) throw new AppError(`Material item not found: ${mat.item}`, 404);
    if (!['RAW_MATERIAL', 'PACKAGING', 'SEMI_FINISHED'].includes(itemDoc.type)) {
      throw new AppError(`Item "${itemDoc.name}" is not a raw material or packaging item`, 400);
    }
  }

  const fbNumber = await generateFBNumber();

  // Capture unitCost at creation time
  const materialsWithCost = await Promise.all(
    data.dispatch.materials.map(async (mat) => {
      const itemDoc = await Item.findById(mat.item).select('costPrice');
      return { item: mat.item, qty: mat.qty, uom: mat.uom, dispatchedQty: 0, unitCost: itemDoc?.costPrice ?? 0 };
    }),
  );

  return FactoryBatch.create({
    fbNumber,
    batchName: data.batchName,
    warehouse: data.warehouse,
    dispatch: { materials: materialsWithCost, notes: data.dispatch.notes },
    expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : undefined,
    notes: data.notes,
    createdBy,
  });
}

export async function updateFactoryBatch(id: string, data: {
  batchName?: string;
  warehouse?: string;
  dispatch?: { materials?: { item: string; qty: number; uom: string }[]; notes?: string };
  expectedDeliveryDate?: string;
  notes?: string;
}) {
  const batch = await FactoryBatch.findById(id);
  if (!batch || !batch.isActive) throw new AppError('Factory batch not found', 404);
  if (batch.status !== 'DRAFT') throw new AppError('Only DRAFT batches can be edited', 400);

  if (data.batchName !== undefined) batch.batchName = data.batchName;
  if (data.warehouse !== undefined) {
    const warehouse = await Warehouse.findById(data.warehouse);
    if (!warehouse || !warehouse.isActive) throw new AppError('Warehouse not found', 404);
    batch.warehouse = data.warehouse as unknown as Types.ObjectId;
  }
  if (data.dispatch?.materials !== undefined) {
    const materialsWithCost = await Promise.all(
      data.dispatch.materials.map(async (mat) => {
        const itemDoc = await Item.findById(mat.item).select('costPrice');
        return { item: mat.item, qty: mat.qty, uom: mat.uom, dispatchedQty: 0, unitCost: itemDoc?.costPrice ?? 0 };
      }),
    );
    batch.dispatch.materials = materialsWithCost as unknown as typeof batch.dispatch.materials;
  }
  if (data.dispatch?.notes !== undefined) batch.dispatch.notes = data.dispatch.notes;
  if (data.expectedDeliveryDate !== undefined) batch.expectedDeliveryDate = new Date(data.expectedDeliveryDate);
  if (data.notes !== undefined) batch.notes = data.notes;

  return batch.save();
}

export async function dispatchMaterials(id: string, createdBy: string) {
  const batch = await FactoryBatch.findById(id);
  if (!batch || !batch.isActive) throw new AppError('Factory batch not found', 404);
  if (batch.status !== 'DRAFT') throw new AppError('Only DRAFT batches can be dispatched', 400);
  if (!batch.dispatch.materials.length) throw new AppError('No materials to dispatch', 400);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    for (const mat of batch.dispatch.materials) {
      await postMovement({
        type: 'FACTORY_DISPATCH',
        item: String(mat.item),
        warehouse: String(batch.warehouse),
        quantity: -mat.qty,
        reference: batch.fbNumber,
        referenceModel: 'FactoryBatch',
        referenceId: String(batch._id),
        notes: `Materials dispatched to factory — ${batch.fbNumber} ${batch.batchName}`,
        createdBy,
        session,
      });
    }

    // Set dispatchedQty = qty for each material
    batch.dispatch.materials.forEach((mat) => { mat.dispatchedQty = mat.qty; });
    batch.dispatch.dispatchedDate = new Date();
    batch.status = 'DISPATCHED';
    await batch.save({ session });

    await session.commitTransaction();
    return getFactoryBatchById(id);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function updateStatus(id: string, newStatus: 'IN_PRODUCTION') {
  const batch = await FactoryBatch.findById(id);
  if (!batch || !batch.isActive) throw new AppError('Factory batch not found', 404);
  if (batch.status !== 'DISPATCHED') throw new AppError('Batch must be DISPATCHED to mark as IN_PRODUCTION', 400);
  batch.status = newStatus;
  await batch.save();
  return getFactoryBatchById(id);
}

export async function addReceipt(id: string, data: {
  receiptDate: string;
  deliveryCost?: number;
  productionCost?: number;
  otherCost?: number;
  products: {
    productName: string;
    linkedItem?: string;
    isNewProduct: boolean;
    newProductData?: { name: string; sku?: string; baseUom: string; salePrice?: number; reorderLevel?: number };
    receivedQty: number;
    uom: string;
    materialsUsed: { item: string; usedQty: number; uom: string }[];
    salePrice?: number;
  }[];
}, createdBy: string) {
  const batch = await FactoryBatch.findById(id);
  if (!batch || !batch.isActive) throw new AppError('Factory batch not found', 404);
  if (!['DISPATCHED', 'IN_PRODUCTION', 'PARTIALLY_RECEIVED'].includes(batch.status)) {
    throw new AppError('Batch must be DISPATCHED, IN_PRODUCTION, or PARTIALLY_RECEIVED to add a receipt', 400);
  }

  // Validate all materialsUsed reference dispatched items
  const dispatchedItemIds = new Set(batch.dispatch.materials.map((m) => String(m.item)));
  for (const product of data.products) {
    for (const mu of product.materialsUsed) {
      if (!dispatchedItemIds.has(mu.item)) {
        throw new AppError(`Material ${mu.item} was not dispatched in this batch`, 400);
      }
    }
  }

  // Load item cost prices for calculation
  const itemCostMap: Record<string, number> = {};
  for (const mat of batch.dispatch.materials) {
    itemCostMap[String(mat.item)] = mat.unitCost;
  }

  // Calculate shared costs
  const deliveryCost = data.deliveryCost ?? 0;
  const productionCost = data.productionCost ?? 0;
  const otherCost = data.otherCost ?? 0;
  const sharedCost = deliveryCost + productionCost + otherCost;
  const totalPieces = data.products.reduce((s, p) => s + p.receivedQty, 0);

  // Calculate per-product costs
  const calculatedProducts = data.products.map((p) => {
    const materialCost = p.materialsUsed.reduce((s, mu) => {
      const unitCost = itemCostMap[mu.item] ?? 0;
      return s + mu.usedQty * unitCost;
    }, 0);
    const allocatedSharedCost = totalPieces > 0 ? (p.receivedQty / totalPieces) * sharedCost : 0;
    const totalUnitCost = p.receivedQty > 0 ? (materialCost + allocatedSharedCost) / p.receivedQty : 0;
    return { ...p, materialCost, allocatedSharedCost, totalUnitCost };
  });

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const receiptNumber = await generateReceiptNumber(id);
    const receiptProducts = [];

    for (const p of calculatedProducts) {
      let itemId: string;

      if (p.linkedItem) {
        const existingItem = await Item.findById(p.linkedItem).session(session);
        if (!existingItem || !existingItem.isActive) throw new AppError(`Item ${p.linkedItem} not found`, 404);
        itemId = p.linkedItem;
      } else if (p.isNewProduct && p.newProductData) {
        const sku = (p.newProductData.sku && p.newProductData.sku.trim())
          ? p.newProductData.sku.trim().toUpperCase()
          : await generateSKU(p.newProductData.name);
        const skuExists = await Item.findOne({ sku }).session(session);
        if (skuExists) throw new AppError(`SKU "${sku}" already exists`, 409);

        const [created] = await Item.create(
          [{
            name: p.newProductData.name,
            sku,
            type: 'FINISHED_GOOD',
            baseUom: p.newProductData.baseUom,
            salePrice: p.newProductData.salePrice,
            reorderLevel: p.newProductData.reorderLevel ?? 0,
            costPrice: p.totalUnitCost,
            createdBy,
          }],
          { session },
        );
        itemId = String(created._id);
      } else {
        throw new AppError(`Product "${p.productName}" needs either linkedItem or isNewProduct with newProductData`, 400);
      }

      // Post stock movement for received product
      await postMovement({
        type: 'FACTORY_RECEIPT',
        item: itemId,
        warehouse: String(batch.warehouse),
        quantity: p.receivedQty,
        reference: receiptNumber,
        referenceModel: 'FactoryBatch',
        referenceId: String(batch._id),
        notes: `Factory receipt ${receiptNumber} — ${p.productName}`,
        createdBy,
        session,
      });

      // Update item costPrice and salePrice
      const updateFields: Record<string, number> = { costPrice: p.totalUnitCost };
      if (p.salePrice !== undefined) updateFields.salePrice = p.salePrice;
      await Item.findByIdAndUpdate(itemId, updateFields, { session });

      receiptProducts.push({
        productName: p.productName,
        linkedItem: itemId,
        isNewProduct: p.isNewProduct,
        newProductData: p.newProductData ? {
          ...p.newProductData,
          baseUom: p.newProductData.baseUom,
        } : undefined,
        receivedQty: p.receivedQty,
        uom: p.uom,
        materialsUsed: p.materialsUsed,
        materialCost: Math.round(p.materialCost * 100) / 100,
        allocatedSharedCost: Math.round(p.allocatedSharedCost * 100) / 100,
        totalUnitCost: Math.round(p.totalUnitCost * 100) / 100,
        salePrice: p.salePrice,
      });
    }

    batch.receipts.push({
      receiptNumber,
      receiptDate: new Date(data.receiptDate),
      deliveryCost,
      productionCost,
      otherCost,
      costAllocationMethod: 'PER_UNIT',
      products: receiptProducts as unknown as typeof batch.receipts[0]['products'],
      createdBy: createdBy as unknown as Types.ObjectId,
      createdAt: new Date(),
    } as typeof batch.receipts[0]);

    // Auto-update status
    if (batch.status !== 'PARTIALLY_RECEIVED' && batch.status !== 'COMPLETED') {
      batch.status = 'PARTIALLY_RECEIVED';
    }

    await batch.save({ session });
    await session.commitTransaction();
    return getFactoryBatchById(id);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function addMaterialReturn(id: string, data: {
  returnDate: string;
  materials: { item: string; returnedQty: number; uom: string }[];
  notes?: string;
}, createdBy: string) {
  const batch = await FactoryBatch.findById(id);
  if (!batch || !batch.isActive) throw new AppError('Factory batch not found', 404);
  if (!['DISPATCHED', 'IN_PRODUCTION', 'PARTIALLY_RECEIVED', 'COMPLETED'].includes(batch.status)) {
    throw new AppError('Cannot return materials for this batch status', 400);
  }

  // Validate items are from dispatch list
  const dispatchedItemIds = new Set(batch.dispatch.materials.map((m) => String(m.item)));
  for (const mat of data.materials) {
    if (!dispatchedItemIds.has(mat.item)) {
      throw new AppError(`Material ${mat.item} was not dispatched in this batch`, 400);
    }
  }

  // Validate returnedQty ≤ remaining factory stock per item
  for (const mat of data.materials) {
    const dispatched = batch.dispatch.materials.find((m) => String(m.item) === mat.item)?.dispatchedQty ?? 0;
    const used = batch.receipts.reduce((s, r) =>
      s + r.products.reduce((ps, p) =>
        ps + p.materialsUsed.filter((mu) => String(mu.item) === mat.item).reduce((ms, mu) => ms + mu.usedQty, 0), 0), 0);
    const returned = batch.materialReturns.reduce((s, r) =>
      s + r.materials.filter((m) => String(m.item) === mat.item).reduce((ms, m) => ms + m.returnedQty, 0), 0);
    const remaining = dispatched - used - returned;
    if (mat.returnedQty > remaining) {
      throw new AppError(`Return qty ${mat.returnedQty} exceeds remaining factory stock ${remaining} for item ${mat.item}`, 400);
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    for (const mat of data.materials) {
      await postMovement({
        type: 'FACTORY_RETURN',
        item: mat.item,
        warehouse: String(batch.warehouse),
        quantity: mat.returnedQty,
        reference: batch.fbNumber,
        referenceModel: 'FactoryBatch',
        referenceId: String(batch._id),
        notes: `Material return from factory — ${batch.fbNumber}`,
        createdBy,
        session,
      });
    }

    batch.materialReturns.push({
      returnDate: new Date(data.returnDate),
      materials: data.materials as unknown as typeof batch.materialReturns[0]['materials'],
      notes: data.notes,
      createdBy: createdBy as unknown as Types.ObjectId,
      createdAt: new Date(),
    } as typeof batch.materialReturns[0]);

    await batch.save({ session });
    await session.commitTransaction();
    return getFactoryBatchById(id);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function restockBatch(id: string, data: {
  restockDate: string;
  materials: { item: string; qty: number; uom: string }[];
  notes?: string;
}, createdBy: string) {
  const batch = await FactoryBatch.findById(id);
  if (!batch || !batch.isActive) throw new AppError('Factory batch not found', 404);
  if (!['DISPATCHED', 'IN_PRODUCTION', 'PARTIALLY_RECEIVED'].includes(batch.status)) {
    throw new AppError('Can only restock a batch that is DISPATCHED, IN_PRODUCTION, or PARTIALLY_RECEIVED', 400);
  }

  // Validate items are raw materials / packaging
  for (const mat of data.materials) {
    const itemDoc = await Item.findById(mat.item);
    if (!itemDoc || !itemDoc.isActive) throw new AppError(`Material item not found: ${mat.item}`, 404);
    if (!['RAW_MATERIAL', 'PACKAGING', 'SEMI_FINISHED'].includes(itemDoc.type)) {
      throw new AppError(`Item "${itemDoc.name}" is not a raw material or packaging item`, 400);
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const restockMaterials: { item: string; qty: number; uom: string; unitCost: number }[] = [];

    for (const mat of data.materials) {
      const itemDoc = await Item.findById(mat.item).select('costPrice').session(session);
      const unitCost = itemDoc?.costPrice ?? 0;

      await postMovement({
        type: 'FACTORY_DISPATCH',
        item: mat.item,
        warehouse: String(batch.warehouse),
        quantity: -mat.qty,
        reference: batch.fbNumber,
        referenceModel: 'FactoryBatch',
        referenceId: String(batch._id),
        notes: `Restock to factory — ${batch.fbNumber} ${batch.batchName}`,
        createdBy,
        session,
      });

      restockMaterials.push({ item: mat.item, qty: mat.qty, uom: mat.uom, unitCost });

      // Merge into dispatch.materials: increase qty + dispatchedQty for existing, or add new line
      const existing = batch.dispatch.materials.find((m) => String(m.item) === mat.item);
      if (existing) {
        existing.qty += mat.qty;
        existing.dispatchedQty += mat.qty;
      } else {
        batch.dispatch.materials.push({
          item: mat.item as unknown as Types.ObjectId,
          qty: mat.qty,
          uom: mat.uom as unknown as Types.ObjectId,
          dispatchedQty: mat.qty,
          unitCost,
        });
      }
    }

    batch.restockHistory.push({
      restockDate: new Date(data.restockDate),
      materials: restockMaterials as unknown as typeof batch.restockHistory[0]['materials'],
      notes: data.notes,
      createdBy: createdBy as unknown as Types.ObjectId,
      createdAt: new Date(),
    } as typeof batch.restockHistory[0]);

    await batch.save({ session });
    await session.commitTransaction();
    return getFactoryBatchById(id);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function cancelFactoryBatch(id: string, createdBy: string) {
  const batch = await FactoryBatch.findById(id);
  if (!batch || !batch.isActive) throw new AppError('Factory batch not found', 404);
  if (!['DRAFT', 'DISPATCHED'].includes(batch.status)) {
    throw new AppError('Only DRAFT or DISPATCHED batches can be cancelled', 400);
  }
  if (batch.receipts.length > 0) {
    throw new AppError('Cannot cancel a batch that has production receipts', 400);
  }

  if (batch.status === 'DISPATCHED') {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      for (const mat of batch.dispatch.materials) {
        if (mat.dispatchedQty > 0) {
          await postMovement({
            type: 'FACTORY_DISPATCH',
            item: String(mat.item),
            warehouse: String(batch.warehouse),
            quantity: mat.dispatchedQty, // positive = return to stock
            reference: batch.fbNumber,
            referenceModel: 'FactoryBatch',
            referenceId: String(batch._id),
            notes: `Cancellation reversal — ${batch.fbNumber}`,
            createdBy,
            session,
          });
        }
      }
      batch.status = 'CANCELLED';
      await batch.save({ session });
      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } else {
    batch.status = 'CANCELLED';
    await batch.save();
  }

  return getFactoryBatchById(id);
}

export async function deleteFactoryBatch(id: string) {
  const batch = await FactoryBatch.findById(id);
  if (!batch || !batch.isActive) throw new AppError('Factory batch not found', 404);
  if (batch.status !== 'DRAFT') throw new AppError('Only DRAFT batches can be deleted', 400);
  batch.isActive = false;
  return batch.save();
}
