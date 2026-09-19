import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as productionService from './production.service';
import {
  createBOMSchema, updateBOMSchema,
  createProductionOrderSchema, updateProductionOrderSchema,
  materialIssueSchema, productionOutputSchema,
} from './production.validator';
import { AuthRequest } from '../../common/middleware/protect';
import { ProductionStatus } from './productionOrder.model';
import { z } from 'zod';

// ── BOM ───────────────────────────────────────────────────────────────────────

export const getBOMs = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await productionService.getBOMs(req.query as Record<string, unknown>);
  sendResponse(res, 200, { boms: items }, 'BOMs fetched', pagination);
});

export const getBOM = asyncHandler(async (req: Request, res: Response) => {
  const bom = await productionService.getBOMById(req.params.id);
  sendResponse(res, 200, { bom }, 'BOM fetched');
});

export const createBOM = asyncHandler(async (req: Request, res: Response) => {
  const data = createBOMSchema.parse(req.body);
  const bom = await productionService.createBOM(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { bom }, 'BOM created');
});

export const updateBOM = asyncHandler(async (req: Request, res: Response) => {
  const data = updateBOMSchema.parse(req.body);
  const bom = await productionService.updateBOM(req.params.id, data);
  sendResponse(res, 200, { bom }, 'BOM updated');
});

export const deleteBOM = asyncHandler(async (req: Request, res: Response) => {
  await productionService.deleteBOM(req.params.id);
  sendResponse(res, 200, null, 'BOM deactivated');
});

// ── Production Orders ─────────────────────────────────────────────────────────

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

// ── Availability Check ────────────────────────────────────────────────────────

export const checkAvailability = asyncHandler(async (req: Request, res: Response) => {
  const { bom, plannedQty, warehouse } = z.object({
    bom: z.string().min(1),
    plannedQty: z.number().min(0.001),
    warehouse: z.string().min(1),
  }).parse(req.query);
  const result = await productionService.checkMaterialAvailability(bom, Number(plannedQty), warehouse);
  sendResponse(res, 200, result, 'Availability checked');
});
