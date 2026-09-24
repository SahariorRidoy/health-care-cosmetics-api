import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as factoryBatchService from './factoryBatch.service';
import {
  createFactoryBatchSchema,
  updateFactoryBatchSchema,
  addReceiptSchema,
  addMaterialReturnSchema,
  restockBatchSchema,
} from './factoryBatch.validator';
import { AuthRequest } from '../../common/middleware/protect';

export const getFactoryBatches = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await factoryBatchService.getFactoryBatches(req.query as Record<string, unknown>);
  sendResponse(res, 200, { factoryBatches: items }, 'Factory batches fetched', pagination);
});

export const getFactoryBatch = asyncHandler(async (req: Request, res: Response) => {
  const batch = await factoryBatchService.getFactoryBatchById(req.params.id);
  sendResponse(res, 200, { factoryBatch: batch }, 'Factory batch fetched');
});

export const getFactoryLedger = asyncHandler(async (req: Request, res: Response) => {
  const result = await factoryBatchService.getFactoryLedger(req.params.factoryId);
  sendResponse(res, 200, result, 'Factory ledger fetched');
});

export const createFactoryBatch = asyncHandler(async (req: Request, res: Response) => {
  const data = createFactoryBatchSchema.parse(req.body);
  const batch = await factoryBatchService.createFactoryBatch(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { factoryBatch: batch }, 'Factory batch created');
});

export const updateFactoryBatch = asyncHandler(async (req: Request, res: Response) => {
  const data = updateFactoryBatchSchema.parse(req.body);
  const batch = await factoryBatchService.updateFactoryBatch(req.params.id, data);
  sendResponse(res, 200, { factoryBatch: batch }, 'Factory batch updated');
});

export const dispatchMaterials = asyncHandler(async (req: Request, res: Response) => {
  const batch = await factoryBatchService.dispatchMaterials(req.params.id, (req as AuthRequest).user!.userId);
  sendResponse(res, 200, { factoryBatch: batch }, 'Materials dispatched to factory');
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = z.object({ status: z.enum(['IN_PRODUCTION']) }).parse(req.body);
  const batch = await factoryBatchService.updateStatus(req.params.id, status);
  sendResponse(res, 200, { factoryBatch: batch }, 'Factory batch status updated');
});

export const addReceipt = asyncHandler(async (req: Request, res: Response) => {
  const data = addReceiptSchema.parse(req.body);
  const batch = await factoryBatchService.addReceipt(req.params.id, data, (req as AuthRequest).user!.userId);
  sendResponse(res, 200, { factoryBatch: batch }, 'Production receipt added');
});

export const addMaterialReturn = asyncHandler(async (req: Request, res: Response) => {
  const data = addMaterialReturnSchema.parse(req.body);
  const batch = await factoryBatchService.addMaterialReturn(req.params.id, data, (req as AuthRequest).user!.userId);
  sendResponse(res, 200, { factoryBatch: batch }, 'Material return recorded');
});

export const restockBatch = asyncHandler(async (req: Request, res: Response) => {
  const data = restockBatchSchema.parse(req.body);
  const batch = await factoryBatchService.restockBatch(req.params.id, data, (req as AuthRequest).user!.userId);
  sendResponse(res, 200, { factoryBatch: batch }, 'Materials restocked to factory');
});

export const cancelFactoryBatch = asyncHandler(async (req: Request, res: Response) => {
  const batch = await factoryBatchService.cancelFactoryBatch(req.params.id, (req as AuthRequest).user!.userId);
  sendResponse(res, 200, { factoryBatch: batch }, 'Factory batch cancelled');
});

export const deleteFactoryBatch = asyncHandler(async (req: Request, res: Response) => {
  await factoryBatchService.deleteFactoryBatch(req.params.id);
  sendResponse(res, 200, null, 'Factory batch deleted');
});
