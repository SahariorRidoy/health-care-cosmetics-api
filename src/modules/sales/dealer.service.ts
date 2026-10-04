import { Dealer } from './dealer.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

export async function getDealers(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);

  const filter: Record<string, unknown> = { isActive: true };
  if (query.search) filter.$text = { $search: String(query.search) };

  const [items, total] = await Promise.all([
    Dealer.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    Dealer.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getDealerById(id: string) {
  const dealer = await Dealer.findById(id);
  if (!dealer || !dealer.isActive) throw new AppError('Dealer not found', 404);
  return dealer;
}

export async function createDealer(data: {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  commissionRate?: number;
}) {
  return Dealer.create(data);
}

export async function updateDealer(id: string, data: Partial<{
  name: string;
  phone: string;
  email: string;
  address: string;
  commissionRate: number;
  isActive: boolean;
}>) {
  const dealer = await Dealer.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!dealer) throw new AppError('Dealer not found', 404);
  return dealer;
}

export async function deleteDealer(id: string) {
  const dealer = await Dealer.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!dealer) throw new AppError('Dealer not found', 404);
  return dealer;
}
