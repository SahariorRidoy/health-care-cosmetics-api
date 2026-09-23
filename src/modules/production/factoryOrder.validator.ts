import { z } from 'zod';

const materialLineSchema = z.object({
  item: z.string().min(1, 'Item is required'),
  qty: z.number().min(0.001, 'Quantity must be greater than 0'),
  uom: z.string().min(1, 'UOM is required'),
});

const expectedProductSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required'),
  expectedQty: z.number().min(0.001, 'Expected quantity must be greater than 0'),
  uom: z.string().min(1, 'UOM is required'),
});

export const createFactoryOrderSchema = z.object({
  orderName: z.string().trim().min(1, 'Order name is required'),
  warehouse: z.string().min(1, 'Warehouse is required'),
  materials: z.array(materialLineSchema).min(1, 'At least one material is required'),
  expectedProducts: z.array(expectedProductSchema).min(1, 'At least one expected product is required'),
  serviceCharge: z.number().min(0).default(0),
  expectedDeliveryDate: z.string().datetime().optional(),
  notes: z.string().trim().optional(),
});

export const updateFactoryOrderSchema = z.object({
  orderName: z.string().trim().min(1).optional(),
  warehouse: z.string().min(1).optional(),
  materials: z.array(materialLineSchema).min(1).optional(),
  expectedProducts: z.array(expectedProductSchema).min(1).optional(),
  serviceCharge: z.number().min(0).optional(),
  expectedDeliveryDate: z.string().datetime().optional(),
  notes: z.string().trim().optional(),
});

const newProductSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required'),
  sku: z.string().trim().optional(),
  salePrice: z.number().min(0).optional(),
  baseUom: z.string().min(1, 'Base UOM is required'),
  reorderLevel: z.number().min(0).default(0),
});

const receiveProductLineSchema = z.object({
  expectedProductIndex: z.number().int().min(0),
  actualQty: z.number().min(0.001, 'Received quantity must be greater than 0'),
  linkedItem: z.string().min(1).optional(),
  newProduct: newProductSchema.optional(),
}).refine(
  (d) => d.linkedItem || d.newProduct,
  { message: 'Either linkedItem or newProduct must be provided' },
);

export const receiveProductsSchema = z.object({
  products: z.array(receiveProductLineSchema).min(1, 'At least one product line is required'),
});
