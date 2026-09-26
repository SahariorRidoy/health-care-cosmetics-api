import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as productionService from './production.service';
import {
  createProductionOrderSchema, updateProductionOrderSchema,
  materialIssueSchema, productionOutputSchema, createProductionBatchSchema,
} from './production.validator';
import { AuthRequest } from '../../common/middleware/protect';
import { ProductionStatus } from './productionOrder.model';
import { z } from 'zod';

// ── Production Orders ─────────────────────────────────────────────────────────

export const getProductionBatches = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await productionService.getProductionBatches(req.query as Record<string, unknown>);
  sendResponse(res, 200, { batches: items }, 'Production batches fetched', pagination);
});

export const createProductionBatch = asyncHandler(async (req: Request, res: Response) => {
  const data = createProductionBatchSchema.parse(req.body);
  const batch = await productionService.createProductionBatch(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { batch }, 'Production batch recorded');
});

export const getProductionOrders = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await productionService.getProductionOrders(req.query as Record<string, unknown>);
  sendResponse(res, 200, { productionOrders: items }, 'Production orders fetched', pagination);
});

export const getProductionOrder = asyncHandler(async (req: Request, res: Response) => {
  const wo = await productionService.getProductionOrderById(req.params.id);
  sendResponse(res, 200, { productionOrder: wo }, 'Production order fetched');
});

export const createProductionOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = createProductionOrderSchema.parse(req.body);
  const wo = await productionService.createProductionOrder(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { productionOrder: wo }, 'Production order created');
});

export const updateProductionOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = updateProductionOrderSchema.parse(req.body);
  const wo = await productionService.updateProductionOrder(req.params.id, data);
  sendResponse(res, 200, { productionOrder: wo }, 'Production order updated');
});

export const updateProductionStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = z.object({ status: z.enum(['IN_PROGRESS', 'COMPLETED', 'CLOSED']) }).parse(req.body);
  const wo = await productionService.updateProductionStatus(req.params.id, status as ProductionStatus);
  sendResponse(res, 200, { productionOrder: wo }, `Production order ${status.toLowerCase().replace('_', ' ')}`);
});

export const deleteProductionOrder = asyncHandler(async (req: Request, res: Response) => {
  await productionService.deleteProductionOrder(req.params.id);
  sendResponse(res, 200, null, 'Production order deleted');
});

// ── Material Issue ────────────────────────────────────────────────────────────

export const issueMaterials = asyncHandler(async (req: Request, res: Response) => {
  const data = materialIssueSchema.parse(req.body);
  const wo = await productionService.issueMaterials(req.params.id, data, (req as AuthRequest).user!.userId);
  sendResponse(res, 200, { productionOrder: wo }, 'Materials issued');
});

// ── Production Output ─────────────────────────────────────────────────────────

export const recordOutput = asyncHandler(async (req: Request, res: Response) => {
  const data = productionOutputSchema.parse(req.body);
  const wo = await productionService.recordOutput(req.params.id, data, (req as AuthRequest).user!.userId);
  sendResponse(res, 200, { productionOrder: wo }, 'Production output recorded');
});
