import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  phone: z.string().trim().optional(),
  email: z.string().email('Invalid email').trim().optional(),
  address: z.string().trim().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  isActive: z.boolean().optional(),
});
