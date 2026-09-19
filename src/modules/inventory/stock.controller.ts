import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as stockService from './stock.service';
import { createAdjustmentSchema } from './stock.validator';
import { AuthRequest } from '../../common/middleware/protect';

export const getStockBalances = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await stockService.getStockBalances(req.query as Record<string, unknown>);
  sendResponse(res, 200, { balances: items }, 'Stock balances fetched', pagination);
});

export const getStockMovements = asyncHandler(async (req: Request, res: Response) => {
  const { movements, pagination } = await stockService.getStockMovements(req.query as Record<string, unknown>);
  sendResponse(res, 200, { movements }, 'Stock movements fetched', pagination);
});

export const createAdjustment = asyncHandler(async (req: Request, res: Response) => {
  const data = createAdjustmentSchema.parse(req.body);
  const result = await stockService.createAdjustment({ ...data, createdBy: (req as AuthRequest).user!.userId });
  sendResponse(res, 201, result, 'Stock adjustment posted');
});
