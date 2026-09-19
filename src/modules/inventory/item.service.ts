import { Item, ItemType } from './item.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

export async function getItems(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);

  const filter: Record<string, unknown> = { isActive: true };
  if (query.search) filter.$text = { $search: String(query.search) };
  if (query.type) filter.type = query.type;
  if (query.category) filter.category = query.category;
  if (query.lowStock === 'true') {
    filter.$expr = { $lte: ['$currentStock', '$reorderLevel'] };
  }

  const [items, total] = await Promise.all([
    Item.find(filter).populate('baseUom', 'name symbol').sort({ name: 1 }).skip(skip).limit(limit),
    Item.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getItemById(id: string) {
  const item = await Item.findById(id).populate('baseUom', 'name symbol');
  if (!item) throw new AppError('Item not found', 404);
  return item;
}

export async function createItem(data: {
  name: string; sku: string; type: ItemType; category: string;
  description?: string; baseUom: string; reorderLevel: number;
  costPrice: number; salePrice?: number;
}, userId: string) {
  const exists = await Item.findOne({ sku: data.sku.toUpperCase() });
  if (exists) throw new AppError('Item with this SKU already exists', 409);
  return Item.create({ ...data, sku: data.sku.toUpperCase(), createdBy: userId });
}

export async function updateItem(id: string, data: Partial<{
  name: string; sku: string; type: ItemType; category: string;
  description: string; baseUom: string; reorderLevel: number;
  costPrice: number; salePrice: number; isActive: boolean;
}>) {
  if (data.sku) data.sku = data.sku.toUpperCase();
  const item = await Item.findByIdAndUpdate(id, data, { new: true, runValidators: true })
    .populate('baseUom', 'name symbol');
  if (!item) throw new AppError('Item not found', 404);
  return item;
}

export async function deleteItem(id: string) {
  const item = await Item.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!item) throw new AppError('Item not found', 404);
  return item;
}

export async function getItemCategories() {
  return Item.distinct('category', { isActive: true });
}
