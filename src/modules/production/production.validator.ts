import { z } from 'zod';

// ── BOM ───────────────────────────────────────────────────────────────────────

const bomInputSchema = z.object({
  item: z.string().min(1, 'Item is required'),
  qty: z.number().min(0.001, 'Quantity must be greater than 0'),
  uom: z.string().min(1, 'UOM is required'),
});

export const createBOMSchema = z.object({
  product: z.string().min(1, 'Product is required'),
  version: z.string().trim().default('v1'),
  inputMaterials: z.array(bomInputSchema).min(1, 'At least one input material is required'),
  expectedOutputQty: z.number().min(0.001, 'Expected output must be greater than 0'),
  outputUom: z.string().min(1, 'Output UOM is required'),
  wastagePercent: z.number().min(0).max(100).default(0),
  notes: z.string().trim().optional(),
});

export const updateBOMSchema = createBOMSchema.partial();

// ── Production Order ──────────────────────────────────────────────────────────

export const createProductionOrderSchema = z.object({
  bom: z.string().min(1, 'BOM is required'),
  warehouse: z.string().min(1, 'Warehouse is required'),
  plannedQty: z.number().min(0.001, 'Planned quantity must be greater than 0'),
  startDate: z.string().datetime().optional(),
  notes: z.string().trim().optional(),
});

export const updateProductionOrderSchema = z.object({
  plannedQty: z.number().min(0.001).optional(),
  startDate: z.string().datetime().optional(),
  notes: z.string().trim().optional(),
});

// ── Material Issue ────────────────────────────────────────────────────────────

const issueLineSchema = z.object({
  item: z.string().min(1, 'Item is required'),
  qty: z.number().min(0.001, 'Quantity must be greater than 0'),
});

export const materialIssueSchema = z.object({
  lines: z.array(issueLineSchema).min(1, 'At least one material line is required'),
  notes: z.string().trim().optional(),
});

// ── Production Output ─────────────────────────────────────────────────────────

export const productionOutputSchema = z.object({
  actualOutputQty: z.number().min(0.001, 'Output quantity must be greater than 0'),
  wastageQty: z.number().min(0).default(0),
  actualConsumed: z.array(z.object({
    item: z.string().min(1),
    qty: z.number().min(0),
  })).optional(),
  notes: z.string().trim().optional(),
});
