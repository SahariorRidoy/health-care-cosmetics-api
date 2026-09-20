import { z } from 'zod';

const itemTypes = ['RAW_MATERIAL', 'PACKAGING', 'SEMI_FINISHED', 'FINISHED_GOOD'] as const;

export const createItemSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  sku: z.string().min(1, 'SKU is required').trim().optional(),
  type: z.enum(itemTypes, { errorMap: () => ({ message: 'Invalid item type' }) }),
  description: z.string().trim().optional(),
  baseUom: z.string().min(1, 'Base UOM is required'),
  supplier: z.string().min(1).optional(),
  unitPrice: z.number().min(0).optional(),
  quantity: z.number().min(0).optional(),
  warehouse: z.string().min(1).optional(),
  costPrice: z.number().min(0).optional(),
  salePrice: z.number().min(0).optional(),
  notes: z.string().trim().optional(),
  expectedDeliveryDate: z.string().datetime().optional(),
});

export const updateItemSchema = z.object({
  name: z.string().min(1).trim().optional(),
  sku: z.string().min(1).trim().optional(),
  type: z.enum(itemTypes).optional(),
  description: z.string().trim().optional(),
  baseUom: z.string().optional(),
  supplier: z.string().optional(),
  costPrice: z.number().min(0).optional(),
  salePrice: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});
