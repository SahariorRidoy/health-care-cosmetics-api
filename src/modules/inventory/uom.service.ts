import { UOM, UOMConversion } from './uom.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

// ── UOM CRUD ──────────────────────────────────────────────────────────────────

export async function getUOMs(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const search = query.search ? { $text: { $search: String(query.search) } } : {};
  const filter = { isActive: true, ...search };

  const [items, total] = await Promise.all([
    UOM.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    UOM.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getUOMById(id: string) {
  const uom = await UOM.findById(id);
  if (!uom) throw new AppError('UOM not found', 404);
  return uom;
}

export async function createUOM(data: { name: string; symbol: string; description?: string }) {
  const exists = await UOM.findOne({ $or: [{ name: data.name }, { symbol: data.symbol }] });
  if (exists) throw new AppError('UOM with this name or symbol already exists', 409);
  return UOM.create(data);
}

export async function updateUOM(id: string, data: { name?: string; symbol?: string; description?: string; isActive?: boolean }) {
  const uom = await UOM.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!uom) throw new AppError('UOM not found', 404);
  return uom;
}

export async function deleteUOM(id: string) {
  const uom = await UOM.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!uom) throw new AppError('UOM not found', 404);
  return uom;
}

// ── UOM Conversion CRUD ───────────────────────────────────────────────────────

export async function getConversions() {
  return UOMConversion.find({ isActive: true })
    .populate('fromUOM', 'name symbol')
    .populate('toUOM', 'name symbol')
    .sort({ createdAt: -1 });
}

export async function createConversion(data: {
  fromUOM: string;
  toUOM: string;
  factor: number;
}, createdBy: string) {
  if (data.fromUOM === data.toUOM) {
    throw new AppError('fromUOM and toUOM cannot be the same', 400);
  }

  const [fromExists, toExists] = await Promise.all([
    UOM.findById(data.fromUOM),
    UOM.findById(data.toUOM),
  ]);
  if (!fromExists) throw new AppError('fromUOM not found', 404);
  if (!toExists) throw new AppError('toUOM not found', 404);

  const existing = await UOMConversion.findOne({
    fromUOM: data.fromUOM,
    toUOM: data.toUOM,
    isActive: true,
  });
  if (existing) throw new AppError('Conversion between these units already exists', 409);

  return UOMConversion.create({ ...data, createdBy });
}

export async function updateConversion(id: string, factor: number) {
  const conv = await UOMConversion.findByIdAndUpdate(
    id,
    { factor },
    { new: true, runValidators: true },
  ).populate('fromUOM', 'name symbol').populate('toUOM', 'name symbol');
  if (!conv || !conv.isActive) throw new AppError('Conversion not found', 404);
  return conv;
}

export async function deleteConversion(id: string) {
  const conv = await UOMConversion.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!conv) throw new AppError('Conversion not found', 404);
  return conv;
}

// ── convertQty utility ────────────────────────────────────────────────────────
// Converts qty from fromUOMId to toUOMId.
// Returns qty unchanged if fromUOMId === toUOMId (same unit, no conversion needed).
// Throws if no conversion path exists.

export async function convertQty(
  qty: number,
  fromUOMId: string,
  toUOMId: string,
): Promise<number> {
  if (String(fromUOMId) === String(toUOMId)) return qty;

  const conversion = await UOMConversion.findOne({
    fromUOM: fromUOMId,
    toUOM: toUOMId,
    isActive: true,
  });

  if (!conversion) {
    // Try reverse direction
    const reverse = await UOMConversion.findOne({
      fromUOM: toUOMId,
      toUOM: fromUOMId,
      isActive: true,
    });
    if (!reverse) {
      throw new AppError(
        `No UOM conversion found between the specified units. Please add a conversion in Settings → UOM → Conversions.`,
        400,
      );
    }
    return Math.round((qty / reverse.factor) * 1000000) / 1000000;
  }

  return Math.round(qty * conversion.factor * 1000000) / 1000000;
}
