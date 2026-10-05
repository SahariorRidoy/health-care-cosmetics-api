import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as procurementService from './procurement.service';
import { createGRSchema, createSupplierPaymentSchema, createSupplierPaymentFIFOSchema } from './procurement.validator';
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

export const deleteGoodsReceipt = asyncHandler(async (req: Request, res: Response) => {
  await procurementService.deleteGoodsReceipt(req.params.id);
  sendResponse(res, 200, null, 'Goods receipt deleted');
});

// ── Supplier Payment ──────────────────────────────────────────────────────────

export const createSupplierPayment = asyncHandler(async (req: Request, res: Response) => {
  const data = createSupplierPaymentSchema.parse(req.body);
  const payment = await procurementService.createSupplierPayment(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { payment }, 'Payment recorded');
});

export const createSupplierPaymentFIFO = asyncHandler(async (req: Request, res: Response) => {
  const data = createSupplierPaymentFIFOSchema.parse(req.body);
  const payment = await procurementService.createSupplierPaymentFIFO(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { payment }, 'Payment recorded and distributed via FIFO');
});

export const getAllSupplierPayments = asyncHandler(async (req: Request, res: Response) => {
  const { payments, pagination } = await procurementService.getAllSupplierPayments(req.query as Record<string, unknown>);
  sendResponse(res, 200, { payments }, 'Payments fetched', pagination);
});

export const getSupplierPaymentById = asyncHandler(async (req: Request, res: Response) => {
  const payment = await procurementService.getSupplierPaymentById(req.params.id);
  sendResponse(res, 200, { payment }, 'Payment fetched');
});

export const getSupplierPayments = asyncHandler(async (req: Request, res: Response) => {
  const { payments, pagination } = await procurementService.getSupplierPayments(
    req.params.supplierId,
    req.query as Record<string, unknown>,
  );
  sendResponse(res, 200, { payments }, 'Payments fetched', pagination);
});

export const deleteSupplierPayment = asyncHandler(async (req: Request, res: Response) => {
  await procurementService.deleteSupplierPayment(req.params.id);
  sendResponse(res, 200, null, 'Payment deleted');
});

// ── Supplier Dues ─────────────────────────────────────────────────────────────

export const getSupplierDues = asyncHandler(async (req: Request, res: Response) => {
  const dues = await procurementService.getSupplierDues(req.params.supplierId);
  sendResponse(res, 200, dues, 'Supplier dues fetched');
});
