import mongoose from 'mongoose';
import { ProductionOrder, ProductionStatus } from './productionOrder.model';
import { Item } from '../inventory/item.model';
import { Warehouse } from '../warehouse/warehouse.model';
import { postMovement } from '../inventory/stock.service';
import { convertQty } from '../inventory/uom.service';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

async function generateWONumber(): Promise<string> {
  const date = new Date();
  const prefix = `WO-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const count = await ProductionOrder.countDocuments({ woNumber: { $regex: `^${prefix}` } });
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

export async function createProductionOrder(data: {
  bom: string; warehouse: string; plannedQty: number;
  startDate?: string; notes?: string;
}, createdBy: string) {
  const warehouse = await Warehouse.findById(data.warehouse);
  if (!warehouse || !warehouse.isActive) throw new AppError('Warehouse not found', 404);

  const woNumber = await generateWONumber();

  return ProductionOrder.create({
    woNumber,
    warehouse: data.warehouse,
    plannedQty: data.plannedQty,
    materials: [],
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
      qty: m.issuedQty,
    }));

    let totalMaterialCost = 0;
    for (const line of consumedLines) {
      if (!line.qty || line.qty <= 0) continue;
      const itemDoc = await Item.findById(line.item).select('costPrice baseUom');
      if (!itemDoc || !itemDoc.costPrice) continue;
      const matLine = wo.materials.find((m) => String(m.item) === String(line.item));
      const matUomId = matLine ? String(matLine.uom) : String(itemDoc.baseUom);
      let baseQty = line.qty;
      try { baseQty = await convertQty(line.qty, matUomId, String(itemDoc.baseUom)); } catch { /* same unit */ }
      totalMaterialCost += baseQty * itemDoc.costPrice;
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
