import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as itemService from './item.service';
import { createItemSchema, updateItemSchema } from './item.validator';
import { AuthRequest } from '../../common/middleware/protect';

export const getItems = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await itemService.getItems(req.query as Record<string, unknown>);
  sendResponse(res, 200, { items }, 'Items fetched', pagination);
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
  const item = await itemService.updateItem(req.params.id, data);
  sendResponse(res, 200, { item }, 'Item updated');
});

export const deleteItem = asyncHandler(async (req: Request, res: Response) => {
  await itemService.deleteItem(req.params.id);
  sendResponse(res, 200, null, 'Item deactivated');
});

export const getCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await itemService.getItemCategories();
  sendResponse(res, 200, { categories }, 'Categories fetched');
});
