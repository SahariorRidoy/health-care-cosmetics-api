import { z } from 'zod';

export const createDepartmentSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  description: z.string().trim().optional(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial().extend({
  isActive: z.boolean().optional(),
});
