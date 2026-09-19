import { z } from 'zod';

export const createExpenseCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  description: z.string().trim().optional(),
});

export const updateExpenseCategorySchema = createExpenseCategorySchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const createExpenseSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  description: z.string().min(1, 'Description is required').trim(),
  amount: z.number().positive('Amount must be positive'),
  expenseDate: z.string().optional(),
  paidBy: z.string().min(1, 'Paid by is required').trim(),
  status: z.enum(['PENDING', 'PAID']).default('PENDING'),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const updateExpenseStatusSchema = z.object({
  status: z.enum(['PENDING', 'PAID']),
});

export const financeSummaryQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});
