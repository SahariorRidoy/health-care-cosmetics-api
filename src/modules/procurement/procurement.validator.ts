import { z } from 'zod';

// ── Goods Receipt ─────────────────────────────────────────────────────────────

const grItemSchema = z.object({
  item: z.string().min(1, 'Item is required'),
  receivedQty: z.number().int('Quantity must be a whole number').min(1, 'Received quantity must be at least 1'),
  unitPrice: z.number().min(0, 'Unit price must be 0 or more'),
  uom: z.string().min(1, 'UOM is required'),
  batchNumber: z.string().trim().optional(),
  expiryDate: z.string().datetime().optional(),
});

export const createGRSchema = z.object({
  purchaseOrder: z.string().min(1, 'Purchase order is required'),
  warehouse: z.string().min(1, 'Warehouse is required'),
  items: z.array(grItemSchema).min(1, 'At least one item is required'),
  notes: z.string().trim().optional(),
  receivedDate: z.string().datetime().optional(),
});

// ── Supplier Payment ──────────────────────────────────────────────────────────

export const createSupplierPaymentSchema = z.object({
  supplier: z.string().min(1, 'Supplier is required'),
  purchaseOrder: z.string().optional(),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  paymentDate: z.string().datetime().optional(),
  method: z.string().min(1, 'Payment method is required').trim(),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const listSupplierPaymentsQuerySchema = z
  .object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().trim().optional(),
    supplier: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid supplier').optional(),
    method: z.string().trim().max(50).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .refine((q) => !q.from || !q.to || new Date(q.from) <= new Date(q.to), {
    message: '"from" date must be before "to" date',
    path: ['from'],
  });

export type ListSupplierPaymentsQuery = z.infer<typeof listSupplierPaymentsQuerySchema>;

export const createSupplierPaymentFIFOSchema = z.object({
  supplier: z.string().min(1, 'Supplier is required'),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  paymentDate: z.string().datetime().optional(),
  method: z.string().min(1, 'Payment method is required').trim(),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});
