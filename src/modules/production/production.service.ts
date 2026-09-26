import mongoose from 'mongoose';
import { ProductionOrder, ProductionStatus } from './productionOrder.model';
import { Item } from '../inventory/item.model';
import { Warehouse } from '../warehouse/warehouse.model';
import { postMovement } from '../inventory/stock.service';
import { convertQty } from '../inventory/uom.service';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';
import { BOM } from './bom.model'; // Import BOM model
import { ProductionBatch } from './productionBatch.model'; // Import ProductionBatch model
import { UOM } from '../inventory/uom.model';

// Helper to generate Work Order number
async function generateWONumber(): Promise<string> {
  const date = new Date();
  const prefix = `WO-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const count = await ProductionOrder.countDocuments({ woNumber: { $regex: `^${prefix}` } });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

// Helper to generate Batch number
async function generateBatchNumber(): Promise<string> {
  const date = new Date();
  const prefix = `BATCH-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const count = await ProductionBatch.countDocuments({ batchNumber: { $regex: `^${prefix}` } });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

export async function getProductionOrders(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = { isActive: true };
  if (query.status) filter.status = query.status;
  if (query.product) filter.product = query.product;

  const [items, total] = await Promise.all([
    ProductionOrder.find(filter)
      .populate('product', 'name sku')
      .populate('warehouse', 'name code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ProductionOrder.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getProductionBatches(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = {};
  if (query.product) filter.product = query.product;

  const [items, total] = await Promise.all([
    ProductionBatch.find(filter)
      .populate('product', 'name sku')
      .populate('productionOrder', 'woNumber')
      .populate('warehouse', 'name code')
      .populate('outputUom', 'name symbol')
      .populate('materialsUsed.item', 'name sku')
      .populate('materialsUsed.uom', 'name symbol')
      .populate('createdBy', 'name')
      .sort({ manufacturedDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ProductionBatch.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function createProductionBatch(data: {
  productId?: string;
  newProduct?: { name: string; sku: string; baseUom: string; salePrice?: number; reorderLevel?: number };
  warehouse: string;
  quantityProduced: number;
  manufacturedDate?: string;
  materials: { item: string; qty: number; uom: string }[];
  notes?: string;
}, createdBy: string) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const warehouse = await Warehouse.findOne({ _id: data.warehouse, isActive: true }).session(session);
    if (!warehouse) throw new AppError('Warehouse not found', 404);

    let product = data.productId
      ? await Item.findOne({ _id: data.productId, type: 'FINISHED_GOOD', isActive: true }).session(session)
      : null;
    const isNewProduct = Boolean(data.newProduct);

    if (data.productId && !product) throw new AppError('Finished product not found', 404);
    if (data.newProduct) {
      const sku = data.newProduct.sku.trim().toUpperCase();
      if (await Item.findOne({ sku }).session(session)) throw new AppError('Item with this SKU already exists', 409);
      const outputUom = await UOM.findOne({ _id: data.newProduct.baseUom, isActive: true }).session(session);
      if (!outputUom) throw new AppError('Output UOM not found', 404);
      [product] = await Item.create([{
        name: data.newProduct.name,
        sku,
        type: 'FINISHED_GOOD',
        baseUom: outputUom._id,
        reorderLevel: data.newProduct.reorderLevel ?? 0,
        salePrice: data.newProduct.salePrice,
        createdBy,
      }], { session });
    }

    if (!product) throw new AppError('Finished product is required', 400);
    const outputUomId = String(product.baseUom);
    const outputUom = await UOM.findById(outputUomId).session(session);
    if (!outputUom || !outputUom.isActive) throw new AppError('Product output UOM not found', 404);

    const materialsUsed = [];
    const materialMovements: { item: string; usageQty: number; usageUom: string; baseQty: number }[] = [];
    let totalMaterialCost = 0;

    for (const line of data.materials) {
      const material = await Item.findOne({
        _id: line.item,
        type: { $in: ['RAW_MATERIAL', 'PACKAGING'] },
        isActive: true,
      }).session(session);
      if (!material) throw new AppError('Production inputs must be active raw materials or packaging items', 400);

      const usageUom = await UOM.findOne({ _id: line.uom, isActive: true }).session(session);
      if (!usageUom) throw new AppError('Material UOM not found', 404);
      const baseUom = await UOM.findById(material.baseUom).select('symbol').session(session);
      if (!baseUom) throw new AppError('Material base UOM not found', 404);

      const baseQty = await convertQty(line.qty, String(line.uom), String(material.baseUom));
      const lineCost = baseQty * material.costPrice;
      totalMaterialCost += lineCost;
      materialMovements.push({ item: String(material._id), usageQty: line.qty, usageUom: String(line.uom), baseQty });
      materialsUsed.push({
        item: material._id,
        itemName: material.name,
        qtyUsed: line.qty,
        costAtTime: material.costPrice,
        uom: usageUom._id,
        uomSymbol: usageUom.symbol,
        baseUomSymbol: baseUom.symbol,
        baseQtyUsed: baseQty,
        lineCost,
      });
    }

    totalMaterialCost = Math.round(totalMaterialCost * 100) / 100;
    const costPerUnit = Math.round((totalMaterialCost / data.quantityProduced) * 100) / 100;
    const batchNumber = await generateBatchNumber();
    const manufacturedDate = data.manufacturedDate ? new Date(data.manufacturedDate) : new Date();
    const [batch] = await ProductionBatch.create([{
      batchNumber,
      product: product._id,
      productName: product.name,
      productSku: product.sku,
      warehouse: warehouse._id,
      outputUom: outputUom._id,
      outputUomSymbol: outputUom.symbol,
      manufacturedDate,
      quantityProduced: data.quantityProduced,
      costOfMaterials: totalMaterialCost,
      totalProductionCost: totalMaterialCost,
      costPerUnit,
      materialsUsed,
      notes: data.notes,
      createdBy,
    }], { session });

    for (const line of materialMovements) {
      await postMovement({
        type: 'PRODUCTION_ISSUE',
        item: line.item,
        warehouse: String(warehouse._id),
        quantity: -line.baseQty,
        reference: batchNumber,
        referenceModel: 'ProductionBatch',
        referenceId: batch._id,
        usageQty: line.usageQty,
        usageUom: line.usageUom,
        notes: `Material consumed for production batch ${batchNumber}`,
        createdBy,
        session,
      });
    }

    await postMovement({
      type: 'PRODUCTION_OUTPUT',
      item: String(product._id),
      warehouse: String(warehouse._id),
      quantity: data.quantityProduced,
      reference: batchNumber,
      referenceModel: 'ProductionBatch',
      referenceId: batch._id,
      notes: `Production output for batch ${batchNumber}`,
      createdBy,
      session,
    });

    await Item.findByIdAndUpdate(product._id, {
      costPrice: costPerUnit,
      ...(isNewProduct ? {
        materials: data.materials.map((line) => ({ item: line.item, qty: line.qty, uom: line.uom })),
      } : {}),
    }, { session });

    await session.commitTransaction();
    return ProductionBatch.findById(batch._id)
      .populate('product', 'name sku')
      .populate('warehouse', 'name code')
      .populate('outputUom', 'name symbol')
      .populate('materialsUsed.item', 'name sku')
      .populate('materialsUsed.uom', 'name symbol');
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function getProductionOrderById(id: string) {
  const wo = await ProductionOrder.findById(id)
    .populate('product', 'name sku type')
    .populate('warehouse', 'name code')
    .populate('materials.item', 'name sku')
    .populate('materials.uom', 'name symbol')
    .populate('createdBy', 'name');
  if (!wo || !wo.isActive) throw new AppError('Production order not found', 404);
  return wo;
}

// Modified createProductionOrder to fetch BOM details
export async function createProductionOrder(data: {
  bom: string; warehouse: string; plannedQty: number;
  startDate?: string; notes?: string;
}, createdBy: string) {
  const warehouse = await Warehouse.findById(data.warehouse);
  if (!warehouse || !warehouse.isActive) throw new AppError('Warehouse not found', 404);

  const bom = await BOM.findById(data.bom);
  if (!bom || !bom.isActive) throw new AppError('Bill of Materials not found', 404);

  const product = await Item.findById(bom.product);
  if (!product || !product.isActive || product.type !== 'FINISHED_GOOD') {
    throw new AppError('Product for BOM not found or is not a FINISHED_GOOD', 404);
  }

  const woNumber = await generateWONumber();

  // Prepare materials for the ProductionOrder from BOM
  const materials = await Promise.all(bom.inputMaterials.map(async (mat) => {
    const item = await Item.findById(mat.item);
    if (!item) throw new AppError(`Material item ${mat.item} not found in BOM`, 404);

    // Calculate planned quantity for this production order based on BOM and plannedQty
    const plannedQtyForMaterial = (mat.qty / bom.expectedOutputQty) * data.plannedQty;

    return {
      item: mat.item,
      uom: mat.uom,
      plannedQty: plannedQtyForMaterial,
      issuedQty: 0,
      actualConsumedQty: 0,
    };
  }));

  return ProductionOrder.create({
    woNumber,
    bom: data.bom,
    product: bom.product, // Link to the product from BOM
    warehouse: data.warehouse,
    plannedQty: data.plannedQty,
    materials, // Populate materials from BOM
    startDate: data.startDate,
    notes: data.notes,
    createdBy,
  });
}

export async function updateProductionOrder(id: string, data: {
  plannedQty?: number; startDate?: string; notes?: string;
}) {
  const wo = await ProductionOrder.findById(id);
  if (!wo || !wo.isActive) throw new AppError('Production order not found', 404);
  if (wo.status !== 'DRAFT') throw new AppError('Only DRAFT production orders can be edited', 400);

  if (data.plannedQty !== undefined) wo.plannedQty = data.plannedQty;
  if (data.startDate !== undefined) wo.startDate = new Date(data.startDate);
  if (data.notes !== undefined) wo.notes = data.notes;

  return wo.save();
}

export async function deleteProductionOrder(id: string) {
  const wo = await ProductionOrder.findById(id);
  if (!wo || !wo.isActive) throw new AppError('Production order not found', 404);
  if (wo.status !== 'DRAFT') throw new AppError('Only DRAFT production orders can be deleted', 400);
  wo.isActive = false;
  return wo.save();
}

const TRANSITIONS: Record<ProductionStatus, ProductionStatus[]> = {
  DRAFT: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: ['CLOSED'],
  CLOSED: [],
};

export async function updateProductionStatus(id: string, newStatus: ProductionStatus) {
  const wo = await ProductionOrder.findById(id);
  if (!wo || !wo.isActive) throw new AppError('Production order not found', 404);

  if (!TRANSITIONS[wo.status].includes(newStatus)) {
    throw new AppError(`Cannot transition from ${wo.status} to ${newStatus}`, 400);
  }

  if (newStatus === 'IN_PROGRESS') wo.startDate = wo.startDate ?? new Date();
  if (newStatus === 'COMPLETED') wo.completedDate = new Date();

  wo.status = newStatus;
  return wo.save();
}

export async function issueMaterials(id: string, data: {
  lines: { item: string; qty: number }[];
  notes?: string;
}, createdBy: string) {
  const wo = await ProductionOrder.findById(id);
  if (!wo || !wo.isActive) throw new AppError('Production order not found', 404);
  if (wo.status !== 'IN_PROGRESS') throw new AppError('Production order must be IN_PROGRESS to issue materials', 400);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    for (const line of data.lines) {
      const matLine = wo.materials.find((m) => String(m.item) === String(line.item));
      const itemDoc = await Item.findById(line.item).select('baseUom');
      if (!itemDoc) throw new AppError(`Item ${line.item} not found`, 404);

      let deductQty = line.qty;
      if (matLine) {
        try {
          deductQty = await convertQty(line.qty, String(matLine.uom), String(itemDoc.baseUom));
        } catch { /* same unit */ }
      }
      deductQty = Math.round(deductQty * 1000000) / 1000000;

      await postMovement({
        type: 'PRODUCTION_ISSUE',
        item: line.item,
        warehouse: String(wo.warehouse),
        quantity: -deductQty,
        reference: wo.woNumber,
        referenceModel: 'ProductionOrder',
        referenceId: wo._id as unknown as string,
        notes: data.notes ?? `Material issue for ${wo.woNumber}`,
        createdBy,
        session,
      });

      await ProductionOrder.updateOne(
        { _id: id, 'materials.item': line.item },
        { $inc: { 'materials.$.issuedQty': line.qty } },
        { session },
      );
    }

    await session.commitTransaction();
    return ProductionOrder.findById(id).populate('materials.item', 'name sku');
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

// Modified recordOutput to create ProductionBatch
export async function recordOutput(id: string, data: {
  actualOutputQty: number;
  wastageQty: number;
  actualConsumed?: { item: string; qty: number }[];
  notes?: string;
}, createdBy: string) {
  const wo = await ProductionOrder.findById(id);
  if (!wo || !wo.isActive) throw new AppError('Production order not found', 404);
  if (wo.status !== 'IN_PROGRESS') throw new AppError('Production order must be IN_PROGRESS to record output', 400);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const productDoc = await Item.findById(wo.product).select('name sku baseUom').session(session);
    if (!productDoc) throw new AppError('Finished product not found', 404);
    const outputUom = await UOM.findById(productDoc.baseUom).select('symbol').session(session);

    await postMovement({
      type: 'PRODUCTION_OUTPUT',
      item: String(wo.product),
      warehouse: String(wo.warehouse),
      quantity: data.actualOutputQty,
      reference: wo.woNumber,
      referenceModel: 'ProductionOrder',
      referenceId: wo._id as unknown as string,
      notes: data.notes ?? `Output for ${wo.woNumber}`,
      createdBy,
      session,
    });

    if (data.actualConsumed) {
      for (const line of data.actualConsumed) {
        await ProductionOrder.updateOne(
          { _id: id, 'materials.item': line.item },
          { $set: { 'materials.$.actualConsumedQty': line.qty } },
          { session },
        );
      }
    }

    const consumedLines = data.actualConsumed ?? wo.materials.map((m) => ({
      item: String(m.item),
      qty: m.issuedQty, // Use issuedQty if actualConsumed is not provided
    }));

    let totalMaterialCost = 0;
    const materialsUsedInBatch = [];

    for (const line of consumedLines) {
      if (!line.qty || line.qty <= 0) continue;
      const itemDoc = await Item.findById(line.item).select('costPrice baseUom name'); // Select name for batch
      if (!itemDoc) continue;
      const matLine = wo.materials.find((m) => String(m.item) === String(line.item));
      const matUomId = matLine ? String(matLine.uom) : String(itemDoc.baseUom);
      const materialUom = await UOM.findById(matUomId).select('symbol').session(session);
      const baseUom = await UOM.findById(itemDoc.baseUom).select('symbol').session(session);
      let baseQty = line.qty;
      try { baseQty = await convertQty(line.qty, matUomId, String(itemDoc.baseUom)); } catch { /* same unit */ }
      const materialCost = baseQty * itemDoc.costPrice;
      totalMaterialCost += materialCost;

      materialsUsedInBatch.push({
        item: itemDoc._id,
        itemName: itemDoc.name,
        qtyUsed: line.qty,
        costAtTime: itemDoc.costPrice, // Cost per base unit at the time of production
        uom: matUomId,
        uomSymbol: materialUom?.symbol ?? '',
        baseUomSymbol: baseUom?.symbol ?? '',
        baseQtyUsed: baseQty,
        lineCost: materialCost,
      });
    }

    totalMaterialCost = Math.round(totalMaterialCost * 100) / 100;
    const costPerUnit = data.actualOutputQty > 0
      ? Math.round((totalMaterialCost / data.actualOutputQty) * 100) / 100
      : 0;

    if (costPerUnit > 0) {
      await Item.findByIdAndUpdate(wo.product, { costPrice: costPerUnit }, { session });
    }

    wo.actualOutputQty = data.actualOutputQty;
    wo.wastageQty = data.wastageQty;
    wo.totalMaterialCost = totalMaterialCost;
    wo.costPerUnit = costPerUnit;
    wo.status = 'COMPLETED';
    wo.completedDate = new Date();
    await wo.save({ session });

    // Create ProductionBatch document
    const batchNumber = await generateBatchNumber();
    await ProductionBatch.create([{
      batchNumber,
      product: wo.product,
      productName: productDoc.name,
      productSku: productDoc.sku,
      productionOrder: wo._id,
      warehouse: wo.warehouse,
      outputUom: productDoc.baseUom,
      outputUomSymbol: outputUom?.symbol ?? '',
      manufacturedDate: wo.completedDate || new Date(),
      quantityProduced: data.actualOutputQty,
      costOfMaterials: totalMaterialCost,
      totalProductionCost: totalMaterialCost, // For now, assume total production cost is material cost
      costPerUnit,
      materialsUsed: materialsUsedInBatch,
      notes: data.notes,
      createdBy,
    }], { session });

    await session.commitTransaction();
    return ProductionOrder.findById(id)
      .populate('product', 'name sku')
      .populate('materials.item', 'name sku');
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}
