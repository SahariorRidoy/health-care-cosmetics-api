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
  deliveryDate: z.string().optional(),
});

export const updateSalesOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1).optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  notes: z.string().trim().optional(),
  deliveryDate: z.string().optional(),
});

export const updateSalesOrderStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'DISPATCHED', 'CLOSED', 'CANCELLED']),
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
