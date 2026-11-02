import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as territoryService from './territory.service';
import { createTerritorySchema, updateTerritorySchema } from './territory.validator';

export const getTerritories = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await territoryService.getTerritories(req.query as Record<string, unknown>);
  sendResponse(res, 200, { territories: items }, 'Territories fetched', pagination);
});

export const getTerritory = asyncHandler(async (req: Request, res: Response) => {
  const territory = await territoryService.getTerritoryById(req.params.id);
  sendResponse(res, 200, { territory }, 'Territory fetched');
});

export const createTerritory = asyncHandler(async (req: Request, res: Response) => {
  const data = createTerritorySchema.parse(req.body);
  const territory = await territoryService.createTerritory(data);
  sendResponse(res, 201, { territory }, 'Territory created');
});

export const updateTerritory = asyncHandler(async (req: Request, res: Response) => {
  const data = updateTerritorySchema.parse(req.body);
  const territory = await territoryService.updateTerritory(req.params.id, data);
  sendResponse(res, 200, { territory }, 'Territory updated');
});

export const deleteTerritory = asyncHandler(async (req: Request, res: Response) => {
  await territoryService.deleteTerritory(req.params.id);
  sendResponse(res, 200, null, 'Territory deactivated');
});
