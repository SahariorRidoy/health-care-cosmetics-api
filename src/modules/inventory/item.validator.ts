import { z } from 'zod';

const itemTypes = ['RAW_MATERIAL', 'PACKAGING', 'SEMI_FINISHED', 'FINISHED_GOOD'] as const;

export const createItemSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  sku: z.string().min(1, 'SKU is required').trim(),
  type: z.enum(itemTypes, { errorMap: () => ({ message: 'Invalid item type' }) }),
  category: z.string().min(1, 'Category is required').trim(),
  description: z.string().trim().optional(),
  baseUom: z.string().min(1, 'Base UOM is required'),
  reorderLevel: z.number().min(0).default(0),
  costPrice: z.number().min(0, 'Cost price must be 0 or more'),
  salePrice: z.number().min(0).optional(),
});

export const updateItemSchema = createItemSchema.partial();
