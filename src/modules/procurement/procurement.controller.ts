import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as procurementService from './procurement.service';
import { createGRSchema, createSupplierPaymentSchema } from './procurement.validator';
import { AuthRequest } from '../../common/middleware/protect';

// ── Goods Receipt ─────────────────────────────────────────────────────────────

export const getGoodsReceipts = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await procurementService.getGoodsReceipts(req.query as Record<string, unknown>);
  sendResponse(res, 200, { goodsReceipts: items }, 'Goods receipts fetched', pagination);
});

export const getGoodsReceipt = asyncHandler(async (req: Request, res: Response) => {
  const gr = await procurementService.getGoodsReceiptById(req.params.id);
  sendResponse(res, 200, { goodsReceipt: gr }, 'Goods receipt fetched');
});

export const createGoodsReceipt = asyncHandler(async (req: Request, res: Response) => {
  const data = createGRSchema.parse(req.body);
  const gr = await procurementService.createGoodsReceipt(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { goodsReceipt: gr }, 'Goods receipt created');
});

// ── Supplier Payment ──────────────────────────────────────────────────────────

export const createSupplierPayment = asyncHandler(async (req: Request, res: Response) => {
  const data = createSupplierPaymentSchema.parse(req.body);
  const payment = await procurementService.createSupplierPayment(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { payment }, 'Payment recorded');
});

export const getSupplierPayments = asyncHandler(async (req: Request, res: Response) => {
  const { payments, pagination } = await procurementService.getSupplierPayments(
    req.params.supplierId,
    req.query as Record<string, unknown>,
  );
  sendResponse(res, 200, { payments }, 'Payments fetched', pagination);
});

// ── Supplier Dues ─────────────────────────────────────────────────────────────

export const getSupplierDues = asyncHandler(async (req: Request, res: Response) => {
  const dues = await procurementService.getSupplierDues(req.params.supplierId);
  sendResponse(res, 200, dues, 'Supplier dues fetched');
});
