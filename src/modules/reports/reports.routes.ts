import { Router } from 'express';
import {
  getStockBalanceReport, getStockMovementReport, getLowStockReport, getStockValuationReport,
  getProductionReport, getProductionSummary,
  getSalesReport, getSalesSummary,
  getPurchaseReport, getPurchaseSummary,
  getFinanceReport, getFinanceSummaryReport,
  getEmployeeListReport, getAttendanceSummaryReport, getPayrollSummaryReport,
} from './reports.controller';
import { protect } from '../../common/middleware/protect';
import { requirePermission } from '../../common/middleware/requirePermission';
import { PERMISSIONS } from '../permissions/permissions.constants';

const router = Router();
router.use(protect);
router.use(requirePermission(PERMISSIONS.REPORTS_VIEW));

// Stock (T59)
router.get('/stock/balance', getStockBalanceReport);
router.get('/stock/movements', getStockMovementReport);
router.get('/stock/low-stock', getLowStockReport);
router.get('/stock/valuation', getStockValuationReport);

// Production (T60)
router.get('/production', getProductionReport);
router.get('/production/summary', getProductionSummary);

// Sales (T61)
router.get('/sales', getSalesReport);
router.get('/sales/summary', getSalesSummary);

// Purchase (T62)
router.get('/purchase', getPurchaseReport);
router.get('/purchase/summary', getPurchaseSummary);

// Finance (T63)
router.get('/finance', getFinanceReport);
router.get('/finance/summary', getFinanceSummaryReport);

// HR (T64)
router.get('/hr/employees', getEmployeeListReport);
router.get('/hr/attendance', getAttendanceSummaryReport);
router.get('/hr/payroll', getPayrollSummaryReport);

export default router;
