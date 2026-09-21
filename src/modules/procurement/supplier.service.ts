import { Supplier } from './supplier.model';
import { PurchaseOrder } from './purchaseOrder.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

export async function getSuppliers(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);

  const filter: Record<string, unknown> = { isActive: true };
  if (query.search) filter.$text = { $search: String(query.search) };

  const [items, total] = await Promise.all([
    Supplier.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    Supplier.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getSupplierById(id: string) {
  const supplier = await Supplier.findById(id);
  if (!supplier || !supplier.isActive) throw new AppError('Supplier not found', 404);

  const pos = await PurchaseOrder.find({ supplier: id, isActive: true });
  const outstandingBalance = Math.round(
    pos.reduce((sum, po) => sum + Math.max(0, po.totalAmount - (po.paidAmount ?? 0)), 0) * 100
  ) / 100;

  if (Math.round(supplier.balance * 100) !== Math.round(outstandingBalance * 100)) {
    await Supplier.findByIdAndUpdate(id, { balance: outstandingBalance });
    supplier.balance = outstandingBalance;
  }

  return supplier;
}

export async function createSupplier(data: {
  name: string;
  contactPerson?: string; phone?: string; email?: string; address?: string;
}) {
  return Supplier.create(data);
}

export async function updateSupplier(id: string, data: Partial<{
  name: string;
  contactPerson: string; phone: string; email: string; address: string; isActive: boolean;
}>) {
  const supplier = await Supplier.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!supplier) throw new AppError('Supplier not found', 404);
  return supplier;
}

export async function deleteSupplier(id: string) {
  const supplier = await Supplier.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!supplier) throw new AppError('Supplier not found', 404);
  return supplier;
}
