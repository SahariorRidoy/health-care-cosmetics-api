import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as warehouseService from './warehouse.service';
import { createWarehouseSchema, updateWarehouseSchema } from './warehouse.validator';

export const getWarehouses = asyncHandler(async (_req: Request, res: Response) => {
  const warehouses = await warehouseService.getWarehouses();
  sendResponse(res, 200, { warehouses }, 'Warehouses fetched');
});

export const getWarehouse = asyncHandler(async (req: Request, res: Response) => {
  const warehouse = await warehouseService.getWarehouseById(req.params.id);
  sendResponse(res, 200, { warehouse }, 'Warehouse fetched');
});

export const createWarehouse = asyncHandler(async (req: Request, res: Response) => {
  const data = createWarehouseSchema.parse(req.body);
  const warehouse = await warehouseService.createWarehouse(data);
  sendResponse(res, 201, { warehouse }, 'Warehouse created');
});

export const updateWarehouse = asyncHandler(async (req: Request, res: Response) => {
  const data = updateWarehouseSchema.parse(req.body);
  const warehouse = await warehouseService.updateWarehouse(req.params.id, data);
  sendResponse(res, 200, { warehouse }, 'Warehouse updated');
});
