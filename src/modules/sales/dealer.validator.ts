import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const optionalText = z.string().trim().optional().transform((v) => v || undefined);

export const createDealerSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  proprietor: optionalText,
  phone: optionalText,
  email: z.union([z.string().email('Invalid email').trim(), z.literal('')]).optional().transform((v) => v || undefined),
  address: optionalText,
  territory: z.union([objectId, z.literal(''), z.null()]).optional().transform((v) => v || null),
  rsmName: optionalText,
  courierName: optionalText,
  campaigns: z.array(objectId).default([]),
  flatPrices: z.array(z.object({
    item: objectId,
    price: z.number().min(0, 'Flat price must be ≥ 0'),
  })).default([]),
  commissionRate: z.number().min(0).max(25).default(0),
});

export const updateDealerSchema = createDealerSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type CreateDealerInput = z.infer<typeof createDealerSchema>;
export type UpdateDealerInput = z.infer<typeof updateDealerSchema>;
