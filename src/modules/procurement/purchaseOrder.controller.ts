import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as poService from './purchaseOrder.service';
import { createPOSchema, updatePOSchema, updatePOStatusSchema, updatePaymentSchema } from './purchaseOrder.validator';
import { AuthRequest } from '../../common/middleware/protect';
import { POStatus } from './purchaseOrder.model';

export const getPurchaseOrders = asyncHandler(async (req: Request, res: Response) => {
  const { items, unpaidCount, pagination } = await poService.getPurchaseOrders(req.query as Record<string, unknown>);
  sendResponse(res, 200, { purchaseOrders: items, unpaidCount }, 'Purchase orders fetched', pagination);
});

export const getPurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const po = await poService.getPurchaseOrderById(req.params.id);
  sendResponse(res, 200, { purchaseOrder: po }, 'Purchase order fetched');
});

export const createPurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = createPOSchema.parse(req.body);
  const po = await poService.createPurchaseOrder(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { purchaseOrder: po }, 'Purchase order created');
});

export const updatePurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = updatePOSchema.parse(req.body);
  const po = await poService.updatePurchaseOrder(req.params.id, data);
  sendResponse(res, 200, { purchaseOrder: po }, 'Purchase order updated');
});

export const updatePOStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = updatePOStatusSchema.parse(req.body);
  const po = await poService.updatePOStatus(req.params.id, status as POStatus);
  sendResponse(res, 200, { purchaseOrder: po }, `Purchase order ${status.toLowerCase()}`);
});

export const updatePOPayment = asyncHandler(async (req: Request, res: Response) => {
  const { paidAmount } = updatePaymentSchema.parse(req.body);
  const po = await poService.updatePOPayment(req.params.id, paidAmount);
  sendResponse(res, 200, { purchaseOrder: po }, 'Payment updated');
});

export const deletePurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  await poService.deletePurchaseOrder(req.params.id);
  sendResponse(res, 200, null, 'Purchase order deleted');
});
