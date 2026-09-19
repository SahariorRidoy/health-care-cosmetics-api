import { z } from 'zod';

export const createUOMSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  symbol: z.string().min(1, 'Symbol is required').trim(),
  description: z.string().trim().optional(),
});

export const updateUOMSchema = createUOMSchema.partial();
