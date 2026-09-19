import { UOM } from './uom.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

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
