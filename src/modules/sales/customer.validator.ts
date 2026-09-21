import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  phone: z.string().trim().optional().transform((v) => v || undefined),
  email: z.union([z.string().email('Invalid email').trim(), z.literal('')]).optional().transform((v) => v || undefined),
  address: z.string().trim().optional().transform((v) => v || undefined),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  isActive: z.boolean().optional(),
});
