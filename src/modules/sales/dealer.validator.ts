import { z } from 'zod';

export const createDealerSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  phone: z.string().trim().optional().transform((v) => v || undefined),
  email: z.union([z.string().email('Invalid email').trim(), z.literal('')]).optional().transform((v) => v || undefined),
  address: z.string().trim().optional().transform((v) => v || undefined),
  commissionRate: z.number().min(0).max(25).default(0),
});

export const updateDealerSchema = createDealerSchema.partial().extend({
  isActive: z.boolean().optional(),
});
