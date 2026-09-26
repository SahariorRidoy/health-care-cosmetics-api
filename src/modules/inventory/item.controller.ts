import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as itemService from './item.service';
import { createItemSchema, updateItemSchema, repurchaseItemSchema, bulkPurchaseSchema } from './item.validator';
import { AuthRequest } from '../../common/middleware/protect';
import { z } from 'zod';

export const generateSku = asyncHandler(async (req: Request, res: Response) => {
  const { name } = z.object({ name: z.string().min(1) }).parse(req.query);
  const sku = await itemService.generateSKU(name);
  sendResponse(res, 200, { sku }, 'SKU generated');
});

export const getItems = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await itemService.getItems(req.query as Record<string, unknown>);
  sendResponse(res, 200, { items }, 'Items fetched', pagination);
});

// New controller function to get finished goods
export const getFinishedGoods = asyncHandler(async (req: Request, res: Response) => {
  const { items } = await itemService.getFinishedGoods(req.query as Record<string, unknown>);
  sendResponse(res, 200, { items }, 'Finished goods fetched');
});

export const getItem = asyncHandler(async (req: Request, res: Response) => {
  const item = await itemService.getItemById(req.params.id);
  sendResponse(res, 200, { item }, 'Item fetched');
});

export const createItem = asyncHandler(async (req: Request, res: Response) => {
  const data = createItemSchema.parse(req.body);
  const item = await itemService.createItem(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { item }, 'Item created');
});

export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const data = updateItemSchema.parse(req.body);
  const item = await itemService.updateItem(req.params.id, data, (req as AuthRequest).user!.userId);
  sendResponse(res, 200, { item }, 'Item updated');
});

export const bulkPurchaseItems = asyncHandler(async (req: Request, res: Response) => {
  const data = bulkPurchaseSchema.parse(req.body);
  const result = await itemService.bulkPurchaseItems(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, result, 'Purchase recorded & stock updated');
});

export const repurchaseItem = asyncHandler(async (req: Request, res: Response) => {
  const data = repurchaseItemSchema.parse(req.body);
  const item = await itemService.repurchaseItem(req.params.id, data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { item }, 'Repurchase recorded & stock updated');
});

export const deleteItem = asyncHandler(async (req: Request, res: Response) => {
  await itemService.deleteItem(req.params.id);
  sendResponse(res, 200, null, 'Item deactivated');
});
