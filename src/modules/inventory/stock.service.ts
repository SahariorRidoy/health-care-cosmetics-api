import mongoose, { Types } from 'mongoose';
import { StockMovement, StockBalance, MovementType } from './stock.model';
import { Item } from './item.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';
import type { ListMovementsQuery } from './stock.validator';

export interface PostMovementInput {
  type: MovementType;
  item: string | Types.ObjectId;
  warehouse: string | Types.ObjectId;
  quantity: number;       // positive = in, negative = out
  reference?: string;
  referenceModel?: string;
  referenceId?: string | Types.ObjectId;
  usageQty?: number;
  usageUom?: string | Types.ObjectId;
  notes?: string;
  createdBy: string | Types.ObjectId;
  session?: mongoose.ClientSession;
}

/**
 * Core stock posting function — ALL stock changes must go through here.
 * Updates StockBalance atomically and records a StockMovement.
 */
export async function postMovement(input: PostMovementInput) {
  const { type, item, warehouse, quantity, reference, referenceModel, referenceId, usageQty, usageUom, notes, createdBy, session } = input;

  if (quantity === 0) throw new AppError('Movement quantity cannot be zero', 400);

  const opts = session ? { session } : {};

  // Atomically update balance (upsert)
  const balance = await StockBalance.findOneAndUpdate(
    { item, warehouse },
    { $inc: { quantity } },
    { new: true, upsert: true, ...opts },
  );

  if (balance.quantity < 0) {
    // Rollback by reversing the increment
    await StockBalance.findOneAndUpdate(
      { item, warehouse },
      { $inc: { quantity: -quantity } },
      opts,
    );
    throw new AppError('Insufficient stock', 400);
  }

  // Sync Item.currentStock as SUM of all warehouse balances for this item
  const itemObjectId = typeof item === 'string' ? new Types.ObjectId(item) : item;
  const allBalances = await StockBalance.aggregate(
    [
      { $match: { item: itemObjectId } },
      { $group: { _id: '$item', total: { $sum: '$quantity' } } },
    ],
    session ? { session } : {},
  );
  const totalStock = allBalances[0]?.total ?? 0;
  await Item.findByIdAndUpdate(item, { currentStock: totalStock }, opts);

  const movement = await StockMovement.create(
    [{
      type,
      item,
      warehouse,
      quantity,
      balanceAfter: balance.quantity,
      reference,
      referenceModel,
      referenceId,
      usageQty,
      usageUom,
      notes,
      createdBy,
    }],
    opts,
  );

  return { movement: movement[0], balance };
}

// ── Stock Balance Queries ─────────────────────────────────────────────────────

export async function getStockBalances(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const lowStock = query.lowStock === 'true';
  const archived = query.archived === 'true';

  const filter: Record<string, unknown> = {};
  if (query.item) filter.item = query.item;
  if (query.warehouse) filter.warehouse = query.warehouse;
  if (query.search) {
    const regex = { $regex: String(query.search), $options: 'i' };
    const isActiveFilter = archived ? false : true;
    const matchedItems = await Item.find({ $or: [{ name: regex }, { sku: regex }], isActive: isActiveFilter }).select('_id');
    filter.item = { $in: matchedItems.map((i) => i._id) };
  }

  const itemMatch = archived ? { isActive: false } : { isActive: true };

  const allBalances = await StockBalance.find(filter)
    .populate({ path: 'item', select: 'name sku type category reorderLevel costPrice salePrice isActive baseUom', match: itemMatch, populate: { path: 'baseUom', select: 'symbol' } })
    .populate('warehouse', 'name code')
    .sort({ updatedAt: -1 });

  // For active: only items with stock > 0; for archived: items with quantity = 0 (deleted)
  let result = allBalances.filter((b) => {
    if (b.item == null) return false;
    return archived ? b.quantity === 0 : b.quantity > 0;
  });

  if (lowStock) {
    result = result.filter((b) => {
      const item = b.item as unknown as { reorderLevel?: number };
      return b.quantity <= (item?.reorderLevel ?? 0);
    });
  }

  const total = result.length;
  const items = result.slice(skip, skip + limit);

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const stats = { totalItems: total, lowStock: 0, materialsValue: 0, productionValue: 0, productionSaleValue: 0 };
  for (const b of result) {
    const item = b.item as unknown as { type?: string; reorderLevel?: number; costPrice?: number; salePrice?: number };
    const qty = Math.max(0, b.quantity);
    if ((item.reorderLevel ?? 0) > 0 && b.quantity <= (item.reorderLevel ?? 0)) stats.lowStock += 1;
    if (item.type === 'FINISHED_GOOD') {
      stats.productionValue += qty * (item.costPrice ?? 0);
      stats.productionSaleValue += qty * (item.salePrice ?? 0);
    } else {
      stats.materialsValue += qty * (item.costPrice ?? 0);
    }
  }
  stats.materialsValue = round2(stats.materialsValue);
  stats.productionValue = round2(stats.productionValue);
  stats.productionSaleValue = round2(stats.productionSaleValue);

  return { items, stats, pagination: buildPagination(page, limit, total) };
}

export async function getStockMovements(query: ListMovementsQuery) {
  const { page, limit, skip } = parsePagination(query);

  const filter: Record<string, unknown> = {};
  if (query.warehouse) filter.warehouse = new Types.ObjectId(query.warehouse);
  if (query.type) filter.type = query.type;
  if (query.direction === 'in') filter.quantity = { $gt: 0 };
  if (query.direction === 'out') filter.quantity = { $lt: 0 };
  if (query.from || query.to) {
    filter.createdAt = {
      ...(query.from ? { $gte: new Date(query.from) } : {}),
      ...(query.to ? { $lte: new Date(query.to) } : {}),
    };
  }

  // Item scope: archived → deleted items; default → active items with current stock > 0
  const archived = query.archived === 'true';
  const itemFilter: Record<string, unknown> = archived
    ? { isActive: false }
    : { isActive: true, currentStock: { $gt: 0 } };
  if (query.item) itemFilter._id = new Types.ObjectId(query.item);
  if (query.category === 'materials') itemFilter.type = { $in: ['RAW_MATERIAL', 'PACKAGING', 'SEMI_FINISHED'] };
  if (query.category === 'production') itemFilter.type = 'FINISHED_GOOD';

  const scopedItemIds = (await Item.find(itemFilter).select('_id')).map((i) => i._id);
  filter.item = { $in: scopedItemIds };

  const searchRegex = query.search
    ? { $regex: query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    : null;
  if (query.reference) filter.reference = query.reference;
  else if (searchRegex) {
    const matchedIds = (await Item.find({ _id: { $in: scopedItemIds }, $or: [{ name: searchRegex }, { sku: searchRegex }] }).select('_id'))
      .map((i) => i._id);
    filter.$or = [{ item: { $in: matchedIds } }, { reference: searchRegex }];
  }

  const [movements, total, statsAgg] = await Promise.all([
    StockMovement.find(filter)
      .populate({ path: 'item', select: 'name sku type costPrice baseUom', populate: { path: 'baseUom', select: 'symbol' } })
      .populate('warehouse', 'name code')
      .populate('usageUom', '_id symbol')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    StockMovement.countDocuments(filter),
    StockMovement.aggregate<{ inCount: number; outCount: number; inValue: number; outValue: number; items: unknown[] }>([
      { $match: filter },
      { $lookup: { from: 'items', localField: 'item', foreignField: '_id', as: 'itemDoc' } },
      { $addFields: { cost: { $ifNull: [{ $arrayElemAt: ['$itemDoc.costPrice', 0] }, 0] } } },
      {
        $group: {
          _id: null,
          inCount: { $sum: { $cond: [{ $gt: ['$quantity', 0] }, 1, 0] } },
          outCount: { $sum: { $cond: [{ $lt: ['$quantity', 0] }, 1, 0] } },
          inValue: { $sum: { $cond: [{ $gt: ['$quantity', 0] }, { $multiply: ['$quantity', '$cost'] }, 0] } },
          outValue: { $sum: { $cond: [{ $lt: ['$quantity', 0] }, { $multiply: [{ $abs: '$quantity' }, '$cost'] }, 0] } },
          items: { $addToSet: '$item' },
        },
      },
    ]),
  ]);

  const s = statsAgg[0];
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const stats = {
    totalMovements: total,
    itemsAffected: s?.items.length ?? 0,
    inCount: s?.inCount ?? 0,
    outCount: s?.outCount ?? 0,
    inValue: round2(s?.inValue ?? 0),
    outValue: round2(s?.outValue ?? 0),
  };

  return { movements, stats, pagination: buildPagination(page, limit, total) };
}

// ── Stock Adjustment ──────────────────────────────────────────────────────────

export async function createAdjustment(data: {
  item: string;
  warehouse: string;
  quantity: number;
  notes?: string;
  createdBy: string;
}) {
  return postMovement({
    type: 'ADJUSTMENT',
    item: data.item,
    warehouse: data.warehouse,
    quantity: data.quantity,
    notes: data.notes,
    createdBy: data.createdBy,
  });
}
