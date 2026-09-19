import { Customer } from './customer.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

export async function getCustomers(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);

  const filter: Record<string, unknown> = { isActive: true };
  if (query.search) filter.$text = { $search: String(query.search) };
  if (query.category) filter.category = query.category;

  const [items, total] = await Promise.all([
    Customer.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    Customer.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getCustomerById(id: string) {
  const customer = await Customer.findById(id);
  if (!customer || !customer.isActive) throw new AppError('Customer not found', 404);
  return customer;
}

export async function createCustomer(data: {
  name: string; code: string; category: string;
  contactPerson?: string; phone?: string; email?: string; address?: string; creditLimit?: number;
}) {
  const exists = await Customer.findOne({ code: data.code.toUpperCase() });
  if (exists) throw new AppError('Customer with this code already exists', 409);
  return Customer.create(data);
}

export async function updateCustomer(id: string, data: Partial<{
  name: string; code: string; category: string;
  contactPerson: string; phone: string; email: string; address: string;
  creditLimit: number; isActive: boolean;
}>) {
  if (data.code) data.code = data.code.toUpperCase();
  const customer = await Customer.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!customer) throw new AppError('Customer not found', 404);
  return customer;
}

export async function deleteCustomer(id: string) {
  const customer = await Customer.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!customer) throw new AppError('Customer not found', 404);
  return customer;
}

export async function getCustomerCategories() {
  return Customer.distinct('category', { isActive: true });
}
