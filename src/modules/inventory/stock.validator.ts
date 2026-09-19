import { z } from 'zod';

export const createAdjustmentSchema = z.object({
  item: z.string().min(1, 'Item is required'),
  warehouse: z.string().min(1, 'Warehouse is required'),
  quantity: z.number().refine((v) => v !== 0, 'Quantity cannot be zero'),
  notes: z.string().trim().optional(),
});
