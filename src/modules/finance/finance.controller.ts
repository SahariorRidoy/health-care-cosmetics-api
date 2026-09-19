import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import { AuthRequest } from '../../common/middleware/protect';
import * as financeService from './finance.service';
import {
  createExpenseCategorySchema,
  updateExpenseCategorySchema,
  createExpenseSchema,
  updateExpenseSchema,
  updateExpenseStatusSchema,
  financeSummaryQuerySchema,
} from './finance.validator';

// ── Expense Categories ────────────────────────────────────────────────────────

export const getExpenseCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await financeService.getExpenseCategories();
  sendResponse(res, 200, { categories }, 'Expense categories fetched');
});

export const getExpenseCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await financeService.getExpenseCategoryById(req.params.id);
  sendResponse(res, 200, { category }, 'Expense category fetched');
});

export const createExpenseCategory = asyncHandler(async (req: Request, res: Response) => {
  const data = createExpenseCategorySchema.parse(req.body);
  const category = await financeService.createExpenseCategory(data);
  sendResponse(res, 201, { category }, 'Expense category created');
});

export const updateExpenseCategory = asyncHandler(async (req: Request, res: Response) => {
  const data = updateExpenseCategorySchema.parse(req.body);
  const category = await financeService.updateExpenseCategory(req.params.id, data);
  sendResponse(res, 200, { category }, 'Expense category updated');
});

export const deleteExpenseCategory = asyncHandler(async (req: Request, res: Response) => {
  await financeService.deleteExpenseCategory(req.params.id);
  sendResponse(res, 200, null, 'Expense category deactivated');
});

// ── Expenses ──────────────────────────────────────────────────────────────────

export const getExpenses = asyncHandler(async (req: Request, res: Response) => {
  const { items, pagination } = await financeService.getExpenses(req.query as Record<string, unknown>);
  sendResponse(res, 200, { expenses: items }, 'Expenses fetched', pagination);
});

export const getExpense = asyncHandler(async (req: Request, res: Response) => {
  const expense = await financeService.getExpenseById(req.params.id);
  sendResponse(res, 200, { expense }, 'Expense fetched');
});

export const createExpense = asyncHandler(async (req: Request, res: Response) => {
  const data = createExpenseSchema.parse(req.body);
  const expense = await financeService.createExpense(data, (req as AuthRequest).user!.userId);
  sendResponse(res, 201, { expense }, 'Expense created');
});

export const updateExpense = asyncHandler(async (req: Request, res: Response) => {
  const data = updateExpenseSchema.parse(req.body);
  const expense = await financeService.updateExpense(req.params.id, data);
  sendResponse(res, 200, { expense }, 'Expense updated');
});

export const updateExpenseStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = updateExpenseStatusSchema.parse(req.body);
  const expense = await financeService.updateExpenseStatus(req.params.id, status);
  sendResponse(res, 200, { expense }, `Expense marked as ${status.toLowerCase()}`);
});

export const deleteExpense = asyncHandler(async (req: Request, res: Response) => {
  await financeService.deleteExpense(req.params.id);
  sendResponse(res, 200, null, 'Expense deleted');
});

// ── Finance Summary ───────────────────────────────────────────────────────────

export const getFinanceSummary = asyncHandler(async (req: Request, res: Response) => {
  const query = financeSummaryQuerySchema.parse(req.query);
  const summary = await financeService.getFinanceSummary(query);
  sendResponse(res, 200, summary, 'Finance summary fetched');
});
