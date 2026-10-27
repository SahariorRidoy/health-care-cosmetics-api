import { Supplier } from './supplier.model';
import { PurchaseOrder } from './purchaseOrder.model';
import { SupplierPayment } from './supplierPayment.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getSupplierSummary() {
  const supplierIds = await Supplier.find({ isActive: true }).distinct('_id');

  const [perSupplier, paid] = await Promise.all([
    PurchaseOrder.aggregate<{ _id: unknown; purchased: number; due: number }>([
      { $match: { isActive: true, supplier: { $in: supplierIds } } },
      {
        $group: {
          _id: '$supplier',
          purchased: { $sum: '$totalAmount' },
          due: { $sum: { $max: [0, { $subtract: ['$totalAmount', { $ifNull: ['$paidAmount', 0] }] }] } },
        },
      },
    ]),
    SupplierPayment.aggregate<{ total: number }>([
      { $match: { isActive: true, supplier: { $in: supplierIds } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  return {
    totalSuppliers: supplierIds.length,
    suppliersWithDue: perSupplier.filter((s) => s.due > 0.005).length,
    totalPurchased: round2(perSupplier.reduce((sum, s) => sum + s.purchased, 0)),
    totalPaid: round2(paid[0]?.total ?? 0),
    totalDue: round2(perSupplier.reduce((sum, s) => sum + s.due, 0)),
  };
}

export async function getSuppliers(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);

  const filter: Record<string, unknown> = { isActive: true };
  if (query.search) {
    const regex = { $regex: String(query.search), $options: 'i' };
    filter.$or = [{ name: regex }, { contactPerson: regex }, { phone: regex }, { email: regex }];
  }

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
