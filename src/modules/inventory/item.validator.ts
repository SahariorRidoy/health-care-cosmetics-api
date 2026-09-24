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
  reorderLevel: z.number().int().min(0).optional(),
  notes: z.string().trim().optional(),
  expectedDeliveryDate: z.string().datetime().optional(),
  paidAmount: z.number().min(0).optional(),
  materials: z.array(z.object({
    item: z.string().min(1),
    qty: z.number().min(0.000001),
    uom: z.string().min(1),
    warehouse: z.string().min(1),
  })).optional(),
});

export const repurchaseItemSchema = z.object({
  supplier: z.string().min(1, 'Supplier is required'),
  warehouse: z.string().min(1, 'Warehouse is required'),
  quantity: z.number().min(0.001, 'Quantity must be greater than 0'),
  unitPrice: z.number().min(0, 'Unit price must be 0 or more'),
  paidAmount: z.number().min(0).optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().trim().optional(),
});

export const bulkPurchaseSchema = z.object({
  supplier: z.string().min(1, 'Supplier is required'),
  warehouse: z.string().min(1, 'Warehouse is required'),
  items: z.array(z.union([
    z.object({
      mode: z.literal('existing'),
      item: z.string().min(1, 'Item is required'),
      quantity: z.number().min(0.001, 'Quantity must be greater than 0'),
      unitPrice: z.number().min(0, 'Unit price must be 0 or more'),
      reorderLevel: z.number().int().min(0).optional(),
    }),
    z.object({
      mode: z.literal('new'),
      name: z.string().min(1, 'Item name is required'),
      sku: z.string().trim().optional(),
      type: z.enum(['RAW_MATERIAL', 'PACKAGING', 'SEMI_FINISHED', 'FINISHED_GOOD']),
      baseUom: z.string().min(1, 'Base UOM is required'),
      description: z.string().trim().optional(),
      quantity: z.number().min(0.001, 'Quantity must be greater than 0'),
      unitPrice: z.number().min(0, 'Unit price must be 0 or more'),
      reorderLevel: z.number().int().min(0).optional(),
    }),
  ])).min(1, 'At least one item is required'),
  paidAmount: z.number().min(0).optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().trim().optional(),
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
  reorderLevel: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  quantity: z.number().min(0.000001).optional(),
  warehouse: z.string().min(1).optional(),
  materials: z.array(z.object({
    item: z.string().min(1),
    qty: z.number().min(0.000001),
    uom: z.string().min(1),
    warehouse: z.string().min(1),
  })).optional(),
});
