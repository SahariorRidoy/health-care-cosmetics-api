import { Warehouse } from './warehouse.model';
import { AppError } from '../../common/utils/errors';

export async function getWarehouses() {
  return Warehouse.find({ isActive: true }).sort({ isDefault: -1, name: 1 });
}

export async function getDefaultWarehouse() {
  const wh = await Warehouse.findOne({ isDefault: true, isActive: true });
  if (!wh) throw new AppError('No default warehouse configured', 404);
  return wh;
}

export async function getWarehouseById(id: string) {
  const wh = await Warehouse.findById(id);
  if (!wh) throw new AppError('Warehouse not found', 404);
  return wh;
}

export async function createWarehouse(data: {
  name: string; code: string; address?: string; isDefault?: boolean;
}) {
  const exists = await Warehouse.findOne({ $or: [{ name: data.name }, { code: data.code }] });
  if (exists) throw new AppError('Warehouse with this name or code already exists', 409);

  // If this is set as default, unset others
  if (data.isDefault) {
    await Warehouse.updateMany({ isDefault: true }, { isDefault: false });
  }

  // If no warehouse exists yet, make this the default
  const count = await Warehouse.countDocuments();
  if (count === 0) data.isDefault = true;

  return Warehouse.create(data);
}

export async function updateWarehouse(id: string, data: {
  name?: string; code?: string; address?: string; isDefault?: boolean; isActive?: boolean;
}) {
  if (data.isDefault) {
    await Warehouse.updateMany({ isDefault: true }, { isDefault: false });
  }
  const wh = await Warehouse.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!wh) throw new AppError('Warehouse not found', 404);
  return wh;
}
