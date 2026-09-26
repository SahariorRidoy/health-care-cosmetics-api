import { z } from 'zod';

const orderItemSchema = z.object({
  item: z.string().min(1),
  description: z.string().trim().optional(),
  qty: z.number().positive(),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).max(100).default(0),
  uom: z.string().min(1),
});

export const createSalesOrderSchema = z.object({
  customer: z.string().min(1, 'Customer is required'),
  warehouse: z.string().min(1, 'Warehouse is required'),
  items: z.array(orderItemSchema).min(1, 'At least one item required'),
  taxPercent: z.number().min(0).max(100).default(0),
  notes: z.string().trim().optional(),
  payment: z.object({
    amount: z.number().positive(),
    method: z.string().min(1),
    reference: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  }).optional(),
});

export const updateSalesOrderSchema = z.object({
  customer: z.string().min(1).optional(),
  warehouse: z.string().min(1).optional(),
  items: z.array(orderItemSchema).min(1).optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  notes: z.string().trim().optional(),
});

// Invoice
const invoiceItemSchema = z.object({
  item: z.string().min(1),
  description: z.string().trim().optional(),
  qty: z.number().positive(),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).max(100).default(0),
  uom: z.string().min(1),
});

export const createInvoiceSchema = z.object({
  customer: z.string().min(1, 'Customer is required'),
  salesOrder: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, 'At least one item required'),
  taxPercent: z.number().min(0).max(100).default(0),
  dueDate: z.string().optional(),
  notes: z.string().trim().optional(),
});

export const updateInvoiceSchema = z.object({
  items: z.array(invoiceItemSchema).min(1).optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  dueDate: z.string().nullable().optional(),
  notes: z.string().trim().optional(),
});

// Customer payment
export const createCustomerPaymentSchema = z.object({
  customer: z.string().min(1, 'Customer is required'),
  invoice: z.string().min(1, 'Invoice is required'),
  amount: z.number().positive('Amount must be positive'),
  paymentDate: z.string().optional(),
  method: z.string().min(1, 'Payment method is required'),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const updateCustomerPaymentSchema = z.object({
  amount: z.number().positive('Amount must be positive').optional(),
  paymentDate: z.string().optional(),
  method: z.string().min(1, 'Payment method is required').optional(),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});
