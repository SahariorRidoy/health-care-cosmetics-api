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
  notes?: string;
  createdBy: string | Types.ObjectId;
  session?: mongoose.ClientSession;
}

/**
 * Core stock posting function — ALL stock changes must go through here.
 * Updates StockBalance atomically and records a StockMovement.
 */
export async function postMovement(input: PostMovementInput) {
  const { type, item, warehouse, quantity, reference, referenceModel, referenceId, notes, createdBy, session } = input;

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

  // Sync Item.currentStock (denormalized for quick reads)
  await Item.findByIdAndUpdate(item, { currentStock: balance.quantity }, opts);

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

  const filter: Record<string, unknown> = {};
  if (query.item) filter.item = query.item;
  if (query.warehouse) filter.warehouse = query.warehouse;

  const balances = StockBalance.find(filter)
    .populate('item', 'name sku type category reorderLevel')
    .populate('warehouse', 'name code')
    .sort({ 'item.name': 1 })
    .skip(skip)
    .limit(limit);

  const [items, total] = await Promise.all([
    balances,
    StockBalance.countDocuments(filter),
  ]);

  // Filter low-stock after population
  const result = query.lowStock === 'true'
    ? items.filter((b) => {
        const item = b.item as unknown as { reorderLevel: number };
        return b.quantity <= (item?.reorderLevel ?? 0);
      })
    : items;

  return { items: result, pagination: buildPagination(page, limit, total) };
}

export async function getStockMovements(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);

  const filter: Record<string, unknown> = {};
  if (query.item) filter.item = query.item;
  if (query.warehouse) filter.warehouse = query.warehouse;
  if (query.type) filter.type = query.type;

  const [movements, total] = await Promise.all([
    StockMovement.find(filter)
      .populate('item', 'name sku')
      .populate('warehouse', 'name code')
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
