import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as stockService from './stock.service';
import { createAdjustmentSchema, listMovementsQuerySchema } from './stock.validator';
import { AuthRequest } from '../../common/middleware/protect';

export const getStockBalances = asyncHandler(async (req: Request, res: Response) => {
  const { items, stats, pagination } = await stockService.getStockBalances(req.query as Record<string, unknown>);
  sendResponse(res, 200, { balances: items, stats }, 'Stock balances fetched', pagination);
});

export const getStockMovements = asyncHandler(async (req: Request, res: Response) => {
  const query = listMovementsQuerySchema.parse(req.query);
  const { movements, stats, pagination } = await stockService.getStockMovements(query);
  sendResponse(res, 200, { movements, stats }, 'Stock movements fetched', pagination);
});

export const createAdjustment = asyncHandler(async (req: Request, res: Response) => {
  const data = createAdjustmentSchema.parse(req.body);
  const result = await stockService.createAdjustment({ ...data, createdBy: (req as AuthRequest).user!.userId });
  sendResponse(res, 201, result, 'Stock adjustment posted');
});
