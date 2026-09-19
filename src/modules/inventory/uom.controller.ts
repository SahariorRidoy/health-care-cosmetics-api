import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as uomService from './uom.service';
import { createUOMSchema, updateUOMSchema } from './uom.validator';

export const getUOMs = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await uomService.getUOMs(req.query as Record<string, unknown>);
  sendResponse(res, 200, { uoms: items }, 'UOMs fetched', pagination);
});

export const getUOM = asyncHandler(async (req: Request, res: Response) => {
  const uom = await uomService.getUOMById(req.params.id);
  sendResponse(res, 200, { uom }, 'UOM fetched');
});

export const createUOM = asyncHandler(async (req: Request, res: Response) => {
  const data = createUOMSchema.parse(req.body);
  const uom = await uomService.createUOM(data);
  sendResponse(res, 201, { uom }, 'UOM created');
});

export const updateUOM = asyncHandler(async (req: Request, res: Response) => {
  const data = updateUOMSchema.parse(req.body);
  const uom = await uomService.updateUOM(req.params.id, data);
  sendResponse(res, 200, { uom }, 'UOM updated');
});

export const deleteUOM = asyncHandler(async (req: Request, res: Response) => {
  await uomService.deleteUOM(req.params.id);
  sendResponse(res, 200, null, 'UOM deactivated');
});
