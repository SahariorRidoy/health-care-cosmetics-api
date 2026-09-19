import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as supplierService from './supplier.service';
import { createSupplierSchema, updateSupplierSchema } from './supplier.validator';

export const getSuppliers = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await supplierService.getSuppliers(req.query as Record<string, unknown>);
  sendResponse(res, 200, { suppliers: items }, 'Suppliers fetched', pagination);
});

export const getSupplier = asyncHandler(async (req: Request, res: Response) => {
  const supplier = await supplierService.getSupplierById(req.params.id);
  sendResponse(res, 200, { supplier }, 'Supplier fetched');
});

export const createSupplier = asyncHandler(async (req: Request, res: Response) => {
  const data = createSupplierSchema.parse(req.body);
  const supplier = await supplierService.createSupplier(data);
  sendResponse(res, 201, { supplier }, 'Supplier created');
});

export const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
  const data = updateSupplierSchema.parse(req.body);
  const supplier = await supplierService.updateSupplier(req.params.id, data);
  sendResponse(res, 200, { supplier }, 'Supplier updated');
});

export const deleteSupplier = asyncHandler(async (req: Request, res: Response) => {
  await supplierService.deleteSupplier(req.params.id);
  sendResponse(res, 200, null, 'Supplier deactivated');
});

export const getSupplierCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await supplierService.getSupplierCategories();
  sendResponse(res, 200, { categories }, 'Categories fetched');
});
