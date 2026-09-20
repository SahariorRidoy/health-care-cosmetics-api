import { z } from 'zod';

export const createUOMSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  symbol: z.string().min(1, 'Symbol is required').trim(),
  description: z.string().trim().optional(),
});

export const updateUOMSchema = createUOMSchema.partial();

export const createConversionSchema = z.object({
  fromUOM: z.string().min(1, 'fromUOM is required'),
  toUOM: z.string().min(1, 'toUOM is required'),
  factor: z.number().positive('Factor must be a positive number'),
});

export const updateConversionSchema = z.object({
  factor: z.number().positive('Factor must be a positive number'),
});
