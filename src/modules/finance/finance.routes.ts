import { Router } from 'express';
import {
  getExpenseCategories, getExpenseCategory, createExpenseCategory,
  updateExpenseCategory, deleteExpenseCategory,
  getExpenses, getExpense, createExpense, updateExpense,
  updateExpenseStatus, deleteExpense,
  getFinanceSummary,
} from './finance.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);

// Expense categories
router.get('/categories', requirePermission(PERMISSIONS.FINANCE_VIEW), getExpenseCategories);
router.get('/categories/:id', requirePermission(PERMISSIONS.FINANCE_VIEW), getExpenseCategory);
router.post('/categories', requirePermission(PERMISSIONS.FINANCE_CREATE), createExpenseCategory);
router.patch('/categories/:id', requirePermission(PERMISSIONS.FINANCE_CREATE), updateExpenseCategory);
router.delete('/categories/:id', requirePermission(PERMISSIONS.FINANCE_CREATE), deleteExpenseCategory);

// Expenses
router.get('/expenses', requirePermission(PERMISSIONS.FINANCE_VIEW), getExpenses);
router.get('/expenses/:id', requirePermission(PERMISSIONS.FINANCE_VIEW), getExpense);
router.post('/expenses', requirePermission(PERMISSIONS.FINANCE_CREATE), createExpense);
router.patch('/expenses/:id', requirePermission(PERMISSIONS.FINANCE_CREATE), updateExpense);
router.patch('/expenses/:id/status', requirePermission(PERMISSIONS.FINANCE_CREATE), updateExpenseStatus);
router.delete('/expenses/:id', requirePermission(PERMISSIONS.FINANCE_CREATE), deleteExpense);

// Summary
router.get('/summary', requirePermission(PERMISSIONS.FINANCE_VIEW), getFinanceSummary);

export default router;
