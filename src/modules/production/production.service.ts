import mongoose from 'mongoose';
import { BOM } from './bom.model';
import { ProductionOrder, ProductionStatus } from './productionOrder.model';
import { StockBalance } from '../inventory/stock.model';
import { Warehouse } from '../warehouse/warehouse.model';
import { postMovement } from '../inventory/stock.service';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

// ── WO Number generator ───────────────────────────────────────────────────────

async function generateWONumber(): Promise<string> {
  const date = new Date();
  const prefix = `WO-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const count = await ProductionOrder.countDocuments({ woNumber: { $regex: `^${prefix}` } });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

// ── BOM ───────────────────────────────────────────────────────────────────────

export async function getBOMs(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = { isActive: true };
  if (query.product) filter.product = query.product;

  const [items, total] = await Promise.all([
    BOM.find(filter)
      .populate('product', 'name sku')
      .populate('inputMaterials.item', 'name sku')
      .populate('inputMaterials.uom', 'name symbol')
      .populate('outputUom', 'name symbol')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    BOM.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getBOMById(id: string) {
  const bom = await BOM.findById(id)
    .populate('product', 'name sku type')
    .populate('inputMaterials.item', 'name sku type')
    .populate('inputMaterials.uom', 'name symbol')
    .populate('outputUom', 'name symbol')
    .populate('createdBy', 'name');
  if (!bom || !bom.isActive) throw new AppError('BOM not found', 404);
  return bom;
}

export async function createBOM(data: {
  product: string; version: string;
  inputMaterials: { item: string; qty: number; uom: string }[];
  expectedOutputQty: number; outputUom: string;
  wastagePercent: number; notes?: string;
}, createdBy: string) {
  const exists = await BOM.findOne({ product: data.product, version: data.version, isActive: true });
  if (exists) throw new AppError('BOM with this product and version already exists', 409);
  return BOM.create({ ...data, createdBy });
}

export async function updateBOM(id: string, data: Partial<{
  version: string;
  inputMaterials: { item: string; qty: number; uom: string }[];
  expectedOutputQty: number; outputUom: string;
  wastagePercent: number; notes: string;
}>) {
  const bom = await BOM.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!bom || !bom.isActive) throw new AppError('BOM not found', 404);
  return bom;
}

export async function deleteBOM(id: string) {
  const bom = await BOM.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!bom) throw new AppError('BOM not found', 404);
  return bom;
}

// ── T40: Material Availability Check ─────────────────────────────────────────

export async function checkMaterialAvailability(bomId: string, plannedQty: number, warehouseId: string) {
  const bom = await BOM.findById(bomId).populate('inputMaterials.item', 'name sku');
  if (!bom || !bom.isActive) throw new AppError('BOM not found', 404);

  const ratio = plannedQty / bom.expectedOutputQty;

  const results = await Promise.all(
    bom.inputMaterials.map(async (mat) => {
      const required = Math.round(mat.qty * ratio * 1000) / 1000;
      const balance = await StockBalance.findOne({ item: mat.item, warehouse: warehouseId });
      const available = balance?.quantity ?? 0;
      const item = mat.item as unknown as { name: string; sku: string };
      return {
        item: mat.item,
        itemName: item.name,
        itemSku: item.sku,
        required,
        available,
        sufficient: available >= required,
        shortage: available < required ? required - available : 0,
      };
    }),
  );

  return {
    canProduce: results.every((r) => r.sufficient),
    materials: results,
  };
}

// ── Production Order CRUD ─────────────────────────────────────────────────────

export async function getProductionOrders(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = { isActive: true };
  if (query.status) filter.status = query.status;
  if (query.product) filter.product = query.product;

  const [items, total] = await Promise.all([
    ProductionOrder.find(filter)
      .populate('product', 'name sku')
      .populate('bom', 'version')
      .populate('warehouse', 'name code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ProductionOrder.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getProductionOrderById(id: string) {
  const wo = await ProductionOrder.findById(id)
    .populate('product', 'name sku type')
    .populate('bom', 'version expectedOutputQty wastagePercent')
    .populate('warehouse', 'name code')
    .populate('materials.item', 'name sku')
    .populate('materials.uom', 'name symbol')
    .populate('createdBy', 'name');
  if (!wo || !wo.isActive) throw new AppError('Production order not found', 404);
  return wo;
}

export async function createProductionOrder(data: {
  bom: string; warehouse: string; plannedQty: number;
  startDate?: string; notes?: string;
}, createdBy: string) {
  const bom = await BOM.findById(data.bom);
  if (!bom || !bom.isActive) throw new AppError('BOM not found', 404);

  const warehouse = await Warehouse.findById(data.warehouse);
  if (!warehouse || !warehouse.isActive) throw new AppError('Warehouse not found', 404);

  const woNumber = await generateWONumber();
  const ratio = data.plannedQty / bom.expectedOutputQty;

  // Scale BOM materials to planned qty
  const materials = bom.inputMaterials.map((mat) => ({
    item: mat.item,
    uom: mat.uom,
    plannedQty: Math.round(mat.qty * ratio * 1000) / 1000,
    issuedQty: 0,
    actualConsumedQty: 0,
  }));

  return ProductionOrder.create({
    woNumber,
    bom: data.bom,
    product: bom.product,
    warehouse: data.warehouse,
    plannedQty: data.plannedQty,
    materials,
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

  // If plannedQty changes, rescale materials
  if (data.plannedQty && data.plannedQty !== wo.plannedQty) {
    const bom = await BOM.findById(wo.bom);
    if (bom) {
      const ratio = data.plannedQty / bom.expectedOutputQty;
      wo.materials = bom.inputMaterials.map((mat) => ({
        item: mat.item,
        uom: mat.uom,
        plannedQty: Math.round(mat.qty * ratio * 1000) / 1000,
        issuedQty: 0,
        actualConsumedQty: 0,
      }));
      wo.plannedQty = data.plannedQty;
    }
  }

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

// ── Status Transitions ────────────────────────────────────────────────────────

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

  // Starting production: run availability check
  if (newStatus === 'IN_PROGRESS') {
    const check = await checkMaterialAvailability(String(wo.bom), wo.plannedQty, String(wo.warehouse));
    if (!check.canProduce) {
      const shortages = check.materials.filter((m) => !m.sufficient)
        .map((m) => `${m.itemName} (need ${m.required}, have ${m.available})`).join('; ');
      throw new AppError(`Insufficient materials: ${shortages}`, 400);
    }
    wo.startDate = wo.startDate ?? new Date();
  }

  if (newStatus === 'COMPLETED') wo.completedDate = new Date();

  wo.status = newStatus;
  return wo.save();
}

// ── T41: Material Issue ───────────────────────────────────────────────────────

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
      await postMovement({
        type: 'PRODUCTION_ISSUE',
        item: line.item,
        warehouse: String(wo.warehouse),
        quantity: -line.qty,   // negative = stock out
        reference: wo.woNumber,
        referenceModel: 'ProductionOrder',
        referenceId: wo._id as unknown as string,
        notes: data.notes ?? `Material issue for ${wo.woNumber}`,
        createdBy,
        session,
      });

      // Update issuedQty on the material line
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

// ── T42: Production Output ────────────────────────────────────────────────────

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
    // Post finished goods into stock
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

    // Update actual consumed quantities if provided
    if (data.actualConsumed) {
      for (const line of data.actualConsumed) {
        await ProductionOrder.updateOne(
          { _id: id, 'materials.item': line.item },
          { $set: { 'materials.$.actualConsumedQty': line.qty } },
          { session },
        );
      }
    }

    wo.actualOutputQty = data.actualOutputQty;
    wo.wastageQty = data.wastageQty;
    wo.status = 'COMPLETED';
    wo.completedDate = new Date();
    await wo.save({ session });

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
