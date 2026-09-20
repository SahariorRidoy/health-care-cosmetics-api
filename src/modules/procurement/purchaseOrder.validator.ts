import { z } from 'zod';

const poItemSchema = z.object({
  item: z.string().min(1, 'Item is required'),
  description: z.string().trim().optional(),
  orderedQty: z.number().int('Quantity must be a whole number').min(1, 'Quantity must be at least 1'),
  unitPrice: z.number().min(0, 'Unit price must be 0 or more'),
  uom: z.string().min(1, 'UOM is required'),
});

export const createPOSchema = z.object({
  supplier: z.string().min(1, 'Supplier is required'),
  items: z.array(poItemSchema).min(1, 'At least one item is required'),
  notes: z.string().trim().optional(),
  expectedDeliveryDate: z.string().datetime().optional(),
});

export const updatePOSchema = z.object({
  items: z.array(poItemSchema).min(1).optional(),
  notes: z.string().trim().optional(),
  expectedDeliveryDate: z.string().datetime().optional(),
});

export const updatePOStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'CLOSED']),
});
