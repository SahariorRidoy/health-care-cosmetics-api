import { Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as uomService from './uom.service';
import { createUOMSchema, updateUOMSchema, createConversionSchema, updateConversionSchema } from './uom.validator';
import type { AuthRequest } from '../../common/middleware/protect';

// ── UOM ───────────────────────────────────────────────────────────────────────

export const getUOMs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { items, pagination } = await uomService.getUOMs(req.query as Record<string, unknown>);
  sendResponse(res, 200, { uoms: items }, 'UOMs fetched', pagination);
});

export const getUOM = asyncHandler(async (req: AuthRequest, res: Response) => {
  const uom = await uomService.getUOMById(req.params.id);
  sendResponse(res, 200, { uom }, 'UOM fetched');
});

export const createUOM = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = createUOMSchema.parse(req.body);
  const uom = await uomService.createUOM(data);
  sendResponse(res, 201, { uom }, 'UOM created');
});

export const updateUOM = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = updateUOMSchema.parse(req.body);
  const uom = await uomService.updateUOM(req.params.id, data);
  sendResponse(res, 200, { uom }, 'UOM updated');
});

export const deleteUOM = asyncHandler(async (req: AuthRequest, res: Response) => {
  await uomService.deleteUOM(req.params.id);
  sendResponse(res, 200, null, 'UOM deactivated');
});

// ── UOM Conversions ───────────────────────────────────────────────────────────

export const getConversions = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const conversions = await uomService.getConversions();
  sendResponse(res, 200, { conversions }, 'Conversions fetched');
});

export const createConversion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = createConversionSchema.parse(req.body);
  const conversion = await uomService.createConversion(data, req.user!.userId);
  sendResponse(res, 201, { conversion }, 'Conversion created');
});

export const updateConversion = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { factor } = updateConversionSchema.parse(req.body);
  const conversion = await uomService.updateConversion(req.params.id, factor);
  sendResponse(res, 200, { conversion }, 'Conversion updated');
});

export const deleteConversion = asyncHandler(async (req: AuthRequest, res: Response) => {
  await uomService.deleteConversion(req.params.id);
  sendResponse(res, 200, null, 'Conversion deactivated');
});
