import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import * as salesService from './sales.service';
import { generateInvoicePDF } from './invoicePdf.service';
import { AuthRequest } from '../../common/middleware/protect';
import {
  createSalesOrderSchema,
  updateSalesOrderSchema,
  updateSalesOrderStatusSchema,
  createInvoiceSchema,
  createCustomerPaymentSchema,
} from './sales.validator';

// ── Sales Orders ──────────────────────────────────────────────────────────────

export const getSalesOrders = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await salesService.getSalesOrders(req.query as Record<string, unknown>);
  sendResponse(res, 200, { salesOrders: items }, 'Sales orders fetched', pagination);
});

export const getSalesOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await salesService.getSalesOrderById(req.params.id);
  sendResponse(res, 200, { salesOrder: order }, 'Sales order fetched');
});

export const createSalesOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = createSalesOrderSchema.parse(req.body);
  const order = await salesService.createSalesOrder(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { salesOrder: order }, 'Sales order created');
});

export const updateSalesOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = updateSalesOrderSchema.parse(req.body);
  const order = await salesService.updateSalesOrder(req.params.id, data);
  sendResponse(res, 200, { salesOrder: order }, 'Sales order updated');
});

export const updateSalesOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = updateSalesOrderStatusSchema.parse(req.body);
  const order = await salesService.updateSalesOrderStatus(req.params.id, status, (req as AuthRequest).user!.userId);
  sendResponse(res, 200, { salesOrder: order }, `Sales order ${status.toLowerCase()}`);
});

export const deleteSalesOrder = asyncHandler(async (req: Request, res: Response) => {
  await salesService.deleteSalesOrder(req.params.id);
  sendResponse(res, 200, null, 'Sales order deleted');
});

// ── Invoices ──────────────────────────────────────────────────────────────────

export const getInvoices = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await salesService.getInvoices(req.query as Record<string, unknown>);
  sendResponse(res, 200, { invoices: items }, 'Invoices fetched', pagination);
});

export const getInvoice = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await salesService.getInvoiceById(req.params.id);
  sendResponse(res, 200, { invoice }, 'Invoice fetched');
});

export const createInvoice = asyncHandler(async (req: Request, res: Response) => {
  const data = createInvoiceSchema.parse(req.body);
  const invoice = await salesService.createInvoice(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { invoice }, 'Invoice created');
});

export const downloadInvoicePDF = asyncHandler(async (req: Request, res: Response) => {
  await generateInvoicePDF(req.params.id, res);
});

// ── Customer Payments ─────────────────────────────────────────────────────────

export const createCustomerPayment = asyncHandler(async (req: Request, res: Response) => {
  const data = createCustomerPaymentSchema.parse(req.body);
  const payment = await salesService.createCustomerPayment(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { payment }, 'Payment recorded');
});

export const getCustomerPayments = asyncHandler(async (req: Request, res: Response) => {
  const { payments, pagination } = await salesService.getCustomerPayments(
    req.params.customerId,
    req.query as Record<string, unknown>,
  );
  sendResponse(res, 200, { payments }, 'Payments fetched', pagination);
});

export const getCustomerDues = asyncHandler(async (req: Request, res: Response) => {
  const dues = await salesService.getCustomerDues(req.params.customerId);
  sendResponse(res, 200, dues, 'Customer dues fetched');
});
