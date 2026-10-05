import mongoose, { Types } from 'mongoose';
import { StockMovement, StockBalance, MovementType } from './stock.model';
import { Item } from './item.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

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
    .populate({ path: 'item', select: 'name sku type category reorderLevel isActive baseUom', match: itemMatch, populate: { path: 'baseUom', select: 'symbol' } })
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

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getStockMovements(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);

  const filter: Record<string, unknown> = {};
  if (query.item) filter.item = query.item;
  if (query.warehouse) filter.warehouse = query.warehouse;
  if (query.type) filter.type = query.type;
  if (query.reference) filter.reference = query.reference;

  const archived = query.archived === 'true';
  if (archived) {
    const deletedItems = await Item.find({ isActive: false }).select('_id');
    filter.item = { $in: deletedItems.map((i) => i._id) };
  } else {
    // Default: only show movements for active items with current stock > 0
    const activeItems = await Item.find({ isActive: true, currentStock: { $gt: 0 } }).select('_id');
    filter.item = { $in: activeItems.map((i) => i._id) };
  }

  const [movements, total] = await Promise.all([
    StockMovement.find(filter)
      .populate({ path: 'item', select: 'name sku type costPrice baseUom', populate: { path: 'baseUom', select: 'symbol' } })
      .populate('warehouse', 'name code')
      .populate('usageUom', '_id symbol')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    StockMovement.countDocuments(filter),
  ]);

  return { movements, pagination: buildPagination(page, limit, total) };
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
