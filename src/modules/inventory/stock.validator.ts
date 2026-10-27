import { z } from 'zod';

export const createAdjustmentSchema = z.object({
  item: z.string().min(1, 'Item is required'),
  warehouse: z.string().min(1, 'Warehouse is required'),
  quantity: z.number().int('Quantity must be a whole number').refine((v) => v !== 0, 'Quantity cannot be zero'),
  notes: z.string().trim().optional(),
});

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const listMovementsQuerySchema = z
  .object({
    page: z.string().optional(),
    limit: z.string().optional(),
    item: objectId.optional(),
    warehouse: objectId.optional(),
    type: z.string().trim().max(40).optional(),
    reference: z.string().trim().max(100).optional(),
    search: z.string().trim().max(100).optional(),
    category: z.enum(['materials', 'production']).optional(),
    direction: z.enum(['in', 'out']).optional(),
    archived: z.enum(['true', 'false']).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .refine((q) => !q.from || !q.to || new Date(q.from) <= new Date(q.to), {
    message: '"from" date must be before "to" date',
    path: ['from'],
  });

export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;
