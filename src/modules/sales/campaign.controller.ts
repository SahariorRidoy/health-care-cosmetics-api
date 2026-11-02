import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as campaignService from './campaign.service';
import { createCampaignSchema, updateCampaignSchema, setCampaignDealersSchema } from './campaign.validator';

export const getCampaigns = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await campaignService.getCampaigns(req.query as Record<string, unknown>);
  sendResponse(res, 200, { campaigns: items }, 'Campaigns fetched', pagination);
});

export const getCampaign = asyncHandler(async (req: Request, res: Response) => {
  const campaign = await campaignService.getCampaignById(req.params.id);
  sendResponse(res, 200, { campaign }, 'Campaign fetched');
});

export const getCampaignPerformance = asyncHandler(async (req: Request, res: Response) => {
  const performance = await campaignService.getCampaignPerformance(req.params.id);
  sendResponse(res, 200, performance, 'Campaign performance fetched');
});

export const createCampaign = asyncHandler(async (req: Request, res: Response) => {
  const data = createCampaignSchema.parse(req.body);
  const campaign = await campaignService.createCampaign(data);
  sendResponse(res, 201, { campaign }, 'Campaign created');
});

export const updateCampaign = asyncHandler(async (req: Request, res: Response) => {
  const data = updateCampaignSchema.parse(req.body);
  const campaign = await campaignService.updateCampaign(req.params.id, data);
  sendResponse(res, 200, { campaign }, 'Campaign updated');
});

export const setCampaignDealers = asyncHandler(async (req: Request, res: Response) => {
  const { dealers } = setCampaignDealersSchema.parse(req.body);
  const result = await campaignService.setCampaignDealers(req.params.id, dealers);
  sendResponse(res, 200, result, 'Campaign dealers updated');
});

export const deleteCampaign = asyncHandler(async (req: Request, res: Response) => {
  await campaignService.deleteCampaign(req.params.id);
  sendResponse(res, 200, null, 'Campaign deactivated');
});
