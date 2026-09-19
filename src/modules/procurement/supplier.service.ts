import { Supplier } from './supplier.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

export async function getSuppliers(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);

  const filter: Record<string, unknown> = { isActive: true };
  if (query.search) filter.$text = { $search: String(query.search) };
  if (query.category) filter.category = query.category;

  const [items, total] = await Promise.all([
    Supplier.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    Supplier.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getSupplierById(id: string) {
  const supplier = await Supplier.findById(id);
  if (!supplier || !supplier.isActive) throw new AppError('Supplier not found', 404);
  return supplier;
}

export async function createSupplier(data: {
  name: string; code: string; category: string;
  contactPerson?: string; phone?: string; email?: string; address?: string;
}) {
  const exists = await Supplier.findOne({ code: data.code.toUpperCase() });
  if (exists) throw new AppError('Supplier with this code already exists', 409);
  return Supplier.create(data);
}

export async function updateSupplier(id: string, data: Partial<{
  name: string; code: string; category: string;
  contactPerson: string; phone: string; email: string; address: string; isActive: boolean;
}>) {
  if (data.code) data.code = data.code.toUpperCase();
  const supplier = await Supplier.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!supplier) throw new AppError('Supplier not found', 404);
  return supplier;
}

export async function deleteSupplier(id: string) {
  const supplier = await Supplier.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!supplier) throw new AppError('Supplier not found', 404);
  return supplier;
}

export async function getSupplierCategories() {
  return Supplier.distinct('category', { isActive: true });
}
