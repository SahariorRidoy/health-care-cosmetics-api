import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as dealerService from './dealer.service';
import { createDealerSchema, updateDealerSchema } from './dealer.validator';

export const getDealers = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await dealerService.getDealers(req.query as Record<string, unknown>);
  sendResponse(res, 200, { dealers: items }, 'Dealers fetched', pagination);
});

export const getDealer = asyncHandler(async (req: Request, res: Response) => {
  const dealer = await dealerService.getDealerById(req.params.id);
  sendResponse(res, 200, { dealer }, 'Dealer fetched');
});

export const createDealer = asyncHandler(async (req: Request, res: Response) => {
  const data = createDealerSchema.parse(req.body);
  const dealer = await dealerService.createDealer(data);
  sendResponse(res, 201, { dealer }, 'Dealer created');
});

export const updateDealer = asyncHandler(async (req: Request, res: Response) => {
  const data = updateDealerSchema.parse(req.body);
  const dealer = await dealerService.updateDealer(req.params.id, data);
  sendResponse(res, 200, { dealer }, 'Dealer updated');
});

export const deleteDealer = asyncHandler(async (req: Request, res: Response) => {
  await dealerService.deleteDealer(req.params.id);
  sendResponse(res, 200, null, 'Dealer deactivated');
});
