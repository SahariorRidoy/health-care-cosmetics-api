import { z } from 'zod';

const dispatchMaterialSchema = z.object({
  item: z.string().min(1, 'Item is required'),
  qty: z.number().min(0.001, 'Quantity must be greater than 0'),
  uom: z.string().min(1, 'UOM is required'),
});

export const createFactoryBatchSchema = z.object({
  batchName: z.string().trim().min(1, 'Batch name is required'),
  warehouse: z.string().min(1, 'Warehouse is required'),
  dispatch: z.object({
    materials: z.array(dispatchMaterialSchema).min(1, 'At least one material is required'),
    notes: z.string().trim().optional(),
  }),
  expectedDeliveryDate: z.string().datetime().optional(),
  notes: z.string().trim().optional(),
});

export const updateFactoryBatchSchema = z.object({
  batchName: z.string().trim().min(1).optional(),
  warehouse: z.string().min(1).optional(),
  dispatch: z.object({
    materials: z.array(dispatchMaterialSchema).min(1).optional(),
    notes: z.string().trim().optional(),
  }).optional(),
  expectedDeliveryDate: z.string().datetime().optional(),
  notes: z.string().trim().optional(),
});

const materialUsedSchema = z.object({
  item: z.string().min(1, 'Material item is required'),
  usedQty: z.number().min(0.001, 'Used quantity must be greater than 0'),
  uom: z.string().min(1, 'UOM is required'),
});

const newProductDataSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required'),
  sku: z.string().trim().min(1).optional(),
  baseUom: z.string().min(1, 'Base UOM is required'),
  salePrice: z.number().min(0).optional(),
  reorderLevel: z.number().min(0).default(0),
});

const receiptProductSchema = z.object({
  productName: z.string().trim().min(1, 'Product name is required'),
  linkedItem: z.string().min(1).optional(),
  isNewProduct: z.boolean(),
  newProductData: newProductDataSchema.optional(),
  receivedQty: z.number().min(0.001, 'Received quantity must be greater than 0'),
  uom: z.string().min(1, 'UOM is required'),
  materialsUsed: z.array(materialUsedSchema).min(1, 'At least one material used is required'),
  salePrice: z.number().min(0).optional(),
}).refine(
  (d) => d.linkedItem || (d.isNewProduct && d.newProductData),
  { message: 'Either linkedItem or isNewProduct with newProductData must be provided' },
);

export const addReceiptSchema = z.object({
  receiptDate: z.string().datetime(),
  deliveryCost: z.number().min(0).default(0),
  productionCost: z.number().min(0).default(0),
  otherCost: z.number().min(0).default(0),
  products: z.array(receiptProductSchema).min(1, 'At least one product is required'),
});

export const addMaterialReturnSchema = z.object({
  returnDate: z.string().datetime(),
  materials: z.array(z.object({
    item: z.string().min(1, 'Item is required'),
    returnedQty: z.number().min(0.001, 'Return quantity must be greater than 0'),
    uom: z.string().min(1, 'UOM is required'),
  })).min(1, 'At least one material is required'),
  notes: z.string().trim().optional(),
});

export const restockBatchSchema = z.object({
  restockDate: z.string().datetime(),
  materials: z.array(z.object({
    item: z.string().min(1, 'Item is required'),
    qty: z.number().min(0.001, 'Quantity must be greater than 0'),
    uom: z.string().min(1, 'UOM is required'),
  })).min(1, 'At least one material is required'),
  notes: z.string().trim().optional(),
});
