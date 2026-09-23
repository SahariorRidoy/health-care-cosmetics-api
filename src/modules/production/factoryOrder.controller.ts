import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as factoryOrderService from './factoryOrder.service';
import {
  createFactoryOrderSchema,
  updateFactoryOrderSchema,
  receiveProductsSchema,
} from './factoryOrder.validator';
import { AuthRequest } from '../../common/middleware/protect';
import { z } from 'zod';

export const getFactoryOrders = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await factoryOrderService.getFactoryOrders(req.query as Record<string, unknown>);
  sendResponse(res, 200, { factoryOrders: items }, 'Factory orders fetched', pagination);
});

export const getFactoryOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await factoryOrderService.getFactoryOrderById(req.params.id);
  sendResponse(res, 200, { factoryOrder: order }, 'Factory order fetched');
});

export const createFactoryOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = createFactoryOrderSchema.parse(req.body);
  const order = await factoryOrderService.createFactoryOrder(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { factoryOrder: order }, 'Factory order created');
});

export const updateFactoryOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = updateFactoryOrderSchema.parse(req.body);
  const order = await factoryOrderService.updateFactoryOrder(req.params.id, data);
  sendResponse(res, 200, { factoryOrder: order }, 'Factory order updated');
});

export const dispatchMaterials = asyncHandler(async (req: Request, res: Response) => {
  const order = await factoryOrderService.dispatchMaterials(req.params.id, (req as AuthRequest).user!.userId);
  sendResponse(res, 200, { factoryOrder: order }, 'Materials dispatched to factory');
});

export const updateFactoryOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = z.object({ status: z.enum(['IN_PRODUCTION']) }).parse(req.body);
  const order = await factoryOrderService.updateFactoryOrderStatus(req.params.id, status);
  sendResponse(res, 200, { factoryOrder: order }, 'Factory order status updated');
});

export const receiveProducts = asyncHandler(async (req: Request, res: Response) => {
  const data = receiveProductsSchema.parse(req.body);
  const order = await factoryOrderService.receiveProducts(req.params.id, data, (req as AuthRequest).user!.userId);
  sendResponse(res, 200, { factoryOrder: order }, 'Products received from factory');
});

export const cancelFactoryOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await factoryOrderService.cancelFactoryOrder(req.params.id, (req as AuthRequest).user!.userId);
  sendResponse(res, 200, { factoryOrder: order }, 'Factory order cancelled');
});

export const deleteFactoryOrder = asyncHandler(async (req: Request, res: Response) => {
  await factoryOrderService.deleteFactoryOrder(req.params.id);
  sendResponse(res, 200, null, 'Factory order deleted');
});
