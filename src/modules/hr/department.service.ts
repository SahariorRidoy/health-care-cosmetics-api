import { Department } from './department.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

export async function getDepartments(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = { isActive: true };
  if (query.search) {
    filter.name = { $regex: String(query.search), $options: 'i' };
  }

  const [items, total] = await Promise.all([
    Department.find(filter).populate('createdBy', 'name').sort({ name: 1 }).skip(skip).limit(limit),
    Department.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getDepartmentById(id: string) {
  const dept = await Department.findById(id).populate('createdBy', 'name');
  if (!dept || !dept.isActive) throw new AppError('Department not found', 404);
  return dept;
}

export async function createDepartment(
  data: { name: string; description?: string },
  createdBy: string,
) {
  const exists = await Department.findOne({ name: { $regex: `^${data.name}$`, $options: 'i' } });
  if (exists) throw new AppError('Department with this name already exists', 409);
  return Department.create({ ...data, createdBy });
}

export async function updateDepartment(
  id: string,
  data: Partial<{ name: string; description: string; isActive: boolean }>,
) {
  if (data.name) {
    const exists = await Department.findOne({
      name: { $regex: `^${data.name}$`, $options: 'i' },
      _id: { $ne: id },
    });
    if (exists) throw new AppError('Department with this name already exists', 409);
  }
  const dept = await Department.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!dept) throw new AppError('Department not found', 404);
  return dept;
}

export async function deleteDepartment(id: string) {
  const dept = await Department.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!dept) throw new AppError('Department not found', 404);
  return dept;
}
