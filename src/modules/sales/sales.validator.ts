import { z } from 'zod';

const orderItemSchema = z.object({
  item: z.string().min(1),
  description: z.string().trim().optional(),
  qty: z.number().positive(),
  giftQty: z.number().min(0).default(0),
  unitPrice: z.number().min(0),
  commissionRate: z.number().min(0).max(100).default(0),
  uom: z.string().min(1),
});

export const createSalesOrderSchema = z.object({
  dealer: z.string().min(1, 'Dealer is required'),
  warehouse: z.string().min(1, 'Warehouse is required'),
  items: z.array(orderItemSchema).min(1, 'At least one item required'),
  taxPercent: z.number().min(0).max(100).default(0),
  commissionRate: z.number().min(0).max(100).default(0),
  notes: z.string().trim().optional(),
  payment: z.object({
    amount: z.number().positive(),
    method: z.string().min(1),
    reference: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  }).optional(),
});

export const updateSalesOrderSchema = z.object({
  notes: z.string().trim().optional(),
});

// Invoice
const invoiceItemSchema = z.object({
  item: z.string().min(1),
  description: z.string().trim().optional(),
  qty: z.number().positive(),
  giftQty: z.number().min(0).default(0),
  unitPrice: z.number().min(0),
  commissionRate: z.number().min(0).max(100).default(0),
  uom: z.string().min(1),
});

export const createInvoiceSchema = z.object({
  dealer: z.string().min(1, 'Dealer is required'),
  salesOrder: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, 'At least one item required'),
  taxPercent: z.number().min(0).max(100).default(0),
  commissionRate: z.number().min(0).max(100).default(0),
  dueDate: z.string().optional(),
  notes: z.string().trim().optional(),
});

export const updateInvoiceSchema = z.object({
  dueDate: z.string().nullable().optional(),
  notes: z.string().trim().optional(),
});

// Dealer payment
export const createCustomerPaymentSchema = z.object({
  dealer: z.string().min(1, 'Dealer is required'),
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
