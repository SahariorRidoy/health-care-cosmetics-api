import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as customerService from './customer.service';
import { createCustomerSchema, updateCustomerSchema } from './customer.validator';

export const getCustomers = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await customerService.getCustomers(req.query as Record<string, unknown>);
  sendResponse(res, 200, { customers: items }, 'Customers fetched', pagination);
});

export const getCustomer = asyncHandler(async (req: Request, res: Response) => {
  const customer = await customerService.getCustomerById(req.params.id);
  sendResponse(res, 200, { customer }, 'Customer fetched');
});

export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
  const data = createCustomerSchema.parse(req.body);
  const customer = await customerService.createCustomer(data);
  sendResponse(res, 201, { customer }, 'Customer created');
});

export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
  const data = updateCustomerSchema.parse(req.body);
  const customer = await customerService.updateCustomer(req.params.id, data);
  sendResponse(res, 200, { customer }, 'Customer updated');
});

export const deleteCustomer = asyncHandler(async (req: Request, res: Response) => {
  await customerService.deleteCustomer(req.params.id);
  sendResponse(res, 200, null, 'Customer deactivated');
});

export const getCustomerCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await customerService.getCustomerCategories();
  sendResponse(res, 200, { categories }, 'Categories fetched');
});
