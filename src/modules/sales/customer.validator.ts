import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  code: z.string().min(1, 'Code is required').trim().toUpperCase(),
  category: z.string().min(1, 'Category is required').trim(),
  contactPerson: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().email('Invalid email').trim().optional(),
  address: z.string().trim().optional(),
  creditLimit: z.number().min(0).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  isActive: z.boolean().optional(),
});
