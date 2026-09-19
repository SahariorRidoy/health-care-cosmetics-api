import { z } from 'zod';

export const dateRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export const stockReportQuerySchema = dateRangeSchema.extend({
  item: z.string().optional(),
  warehouse: z.string().optional(),
  type: z.string().optional(),       // movement type filter
  lowStock: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const productionReportQuerySchema = dateRangeSchema.extend({
  product: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const salesReportQuerySchema = dateRangeSchema.extend({
  customer: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const purchaseReportQuerySchema = dateRangeSchema.extend({
  supplier: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const financeReportQuerySchema = dateRangeSchema.extend({
  category: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const hrReportQuerySchema = dateRangeSchema.extend({
  department: z.string().optional(),
  employee: z.string().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
