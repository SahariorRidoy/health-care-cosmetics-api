import { z } from 'zod';

export const createTerritorySchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  notes: z.string().trim().optional().transform((v) => v || undefined),
});

export const updateTerritorySchema = createTerritorySchema.partial().extend({
  isActive: z.boolean().optional(),
});
