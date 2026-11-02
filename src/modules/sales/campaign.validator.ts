import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const baseCampaign = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  startDate: ymd,
  endDate: ymd,
  durationMonths: z.number().int().min(1).max(24).nullable().optional(),
  territories: z.array(objectId).default([]),
  prize: z.string().min(1, 'Prize / gift is required').trim(),
  notes: z.string().trim().optional().transform((v) => v || undefined),
  targetMode: z.enum(['NONE', 'TOTAL', 'MONTHLY']).default('NONE'),
  totalTarget: z.number().min(0).default(0),
  monthlyTargets: z.array(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM'),
    target: z.number().min(0),
  })).default([]),
  dealerTarget: z.number().min(0).default(0),
});

export const createCampaignSchema = baseCampaign.refine((d) => d.endDate >= d.startDate, {
  message: 'End date must be on or after start date',
  path: ['endDate'],
});

export const updateCampaignSchema = baseCampaign.partial().extend({
  isActive: z.boolean().optional(),
});

export const setCampaignDealersSchema = z.object({
  dealers: z.array(objectId),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
