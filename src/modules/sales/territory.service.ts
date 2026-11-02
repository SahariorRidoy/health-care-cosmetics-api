import { Territory } from './territory.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

export async function getTerritories(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);

  const filter: Record<string, unknown> = { isActive: true };
  if (query.search) filter.$text = { $search: String(query.search) };

  const [items, total] = await Promise.all([
    Territory.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    Territory.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getTerritoryById(id: string) {
  const territory = await Territory.findById(id);
  if (!territory || !territory.isActive) throw new AppError('Territory not found', 404);
  return territory;
}

export async function createTerritory(data: { name: string; notes?: string }) {
  return Territory.create(data);
}

export async function updateTerritory(id: string, data: Partial<{ name: string; notes: string; isActive: boolean }>) {
  const territory = await Territory.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!territory) throw new AppError('Territory not found', 404);
  return territory;
}

export async function deleteTerritory(id: string) {
  const territory = await Territory.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!territory) throw new AppError('Territory not found', 404);
  return territory;
}
