import { Request, Response } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendResponse } from '../../common/utils/response';
import { sendCsvResponse } from './csv.util';
import * as reportsService from './reports.service';
import {
  stockReportQuerySchema,
  productionReportQuerySchema,
  salesReportQuerySchema,
  purchaseReportQuerySchema,
  financeReportQuerySchema,
  hrReportQuerySchema,
  dateRangeSchema,
} from './reports.validator';

// ── Stock (T59) ───────────────────────────────────────────────────────────────

export const getStockBalanceReport = asyncHandler(async (req: Request, res: Response) => {
  const query = stockReportQuerySchema.parse(req.query);
  const { items, pagination } = await reportsService.getStockBalanceReport(query);

  if (req.query.format === 'csv') {
    const rows = items.map((b) => {
      const item = b.item as unknown as { name: string; sku: string; type: string; category: string; reorderLevel: number; costPrice: number };
      return {
        SKU: item?.sku ?? '',
        Item: item?.name ?? '',
        Type: item?.type ?? '',
        Category: item?.category ?? '',
        Quantity: b.quantity,
        ReorderLevel: item?.reorderLevel ?? '',
        CostPrice: item?.costPrice ?? '',
        Valuation: (b as unknown as { valuation: number }).valuation ?? '',
        LowStock: (b as unknown as { isLowStock: boolean }).isLowStock ? 'Yes' : 'No',
      };
    });
    return sendCsvResponse(res, 'stock-balance.csv', rows);
  }

  sendResponse(res, 200, { balances: items }, 'Stock balance report', pagination);
});

export const getStockMovementReport = asyncHandler(async (req: Request, res: Response) => {
  const query = stockReportQuerySchema.parse(req.query);
  const { items, pagination } = await reportsService.getStockMovementReport(query);

  if (req.query.format === 'csv') {
    const rows = items.map((m) => ({
      Date: m.createdAt.toISOString().split('T')[0],
      Type: m.type,
      Item: (m.item as unknown as { name: string })?.name ?? '',
      SKU: (m.item as unknown as { sku: string })?.sku ?? '',
      Warehouse: (m.warehouse as unknown as { name: string })?.name ?? '',
      Quantity: m.quantity,
      BalanceAfter: m.balanceAfter,
      Reference: m.reference ?? '',
      Notes: m.notes ?? '',
    }));
    return sendCsvResponse(res, 'stock-movements.csv', rows);
  }

  sendResponse(res, 200, { movements: items }, 'Stock movement report', pagination);
});

export const getLowStockReport = asyncHandler(async (_req: Request, res: Response) => {
  const items = await reportsService.getLowStockItems();
  sendResponse(res, 200, { items }, 'Low stock report');
});

export const getStockValuationReport = asyncHandler(async (req: Request, res: Response) => {
  const { warehouse } = req.query as { warehouse?: string };
  const data = await reportsService.getStockValuation({ warehouse });

  if (req.query.format === 'csv') {
    return sendCsvResponse(res, 'stock-valuation.csv', data.rows as unknown as Record<string, unknown>[]);
  }

  sendResponse(res, 200, data, 'Stock valuation report');
});

// ── Production (T60) ──────────────────────────────────────────────────────────

export const getProductionReport = asyncHandler(async (req: Request, res: Response) => {
  const query = productionReportQuerySchema.parse(req.query);
  const { items, pagination } = await reportsService.getProductionReport(query);

  if (req.query.format === 'csv') {
    const rows = items.map((o) => ({
      WONumber: o.woNumber,
      Product: (o.product as unknown as { name: string })?.name ?? '',
      Status: o.status,
      PlannedQty: o.plannedQty,
      ActualOutput: o.actualOutputQty,
      Wastage: o.wastageQty,
      StartDate: o.startDate?.toISOString().split('T')[0] ?? '',
      CompletedDate: o.completedDate?.toISOString().split('T')[0] ?? '',
    }));
    return sendCsvResponse(res, 'production-orders.csv', rows);
  }

  sendResponse(res, 200, { orders: items }, 'Production report', pagination);
});

export const getProductionSummary = asyncHandler(async (req: Request, res: Response) => {
  const query = dateRangeSchema.parse(req.query);
  const data = await reportsService.getProductionSummary(query);
  sendResponse(res, 200, data, 'Production summary');
});

// ── Sales (T61) ───────────────────────────────────────────────────────────────

export const getSalesReport = asyncHandler(async (req: Request, res: Response) => {
  const query = salesReportQuerySchema.parse(req.query);
  const { items, pagination } = await reportsService.getSalesReport(query);

  if (req.query.format === 'csv') {
    const rows = items.map((o) => ({
      OrderNumber: o.orderNumber,
      Customer: (o.customer as unknown as { name: string })?.name ?? '',
      Status: o.status,
      Subtotal: o.subtotal,
      Discount: o.discountAmount,
      Tax: o.taxAmount,
      Total: o.totalAmount,
      Date: o.createdAt.toISOString().split('T')[0],
    }));
    return sendCsvResponse(res, 'sales-orders.csv', rows);
  }

  sendResponse(res, 200, { orders: items }, 'Sales report', pagination);
});

export const getSalesSummary = asyncHandler(async (req: Request, res: Response) => {
  const query = dateRangeSchema.parse(req.query);
  const data = await reportsService.getSalesSummary(query);
  sendResponse(res, 200, data, 'Sales summary');
});

// ── Purchase (T62) ────────────────────────────────────────────────────────────

export const getPurchaseReport = asyncHandler(async (req: Request, res: Response) => {
  const query = purchaseReportQuerySchema.parse(req.query);
  const { items, pagination } = await reportsService.getPurchaseReport(query);

  if (req.query.format === 'csv') {
    const rows = items.map((o) => ({
      PONumber: o.poNumber,
      Supplier: (o.supplier as unknown as { name: string })?.name ?? '',
      Status: o.status,
      Total: o.totalAmount,
      Date: o.createdAt.toISOString().split('T')[0],
    }));
    return sendCsvResponse(res, 'purchase-orders.csv', rows);
  }

  sendResponse(res, 200, { orders: items }, 'Purchase report', pagination);
});

export const getPurchaseSummary = asyncHandler(async (req: Request, res: Response) => {
  const query = dateRangeSchema.parse(req.query);
  const data = await reportsService.getPurchaseSummary(query);
  sendResponse(res, 200, data, 'Purchase summary');
});

// ── Finance (T63) ─────────────────────────────────────────────────────────────

export const getFinanceReport = asyncHandler(async (req: Request, res: Response) => {
  const query = financeReportQuerySchema.parse(req.query);
  const { items, pagination } = await reportsService.getFinanceReport(query);

  if (req.query.format === 'csv') {
    const rows = items.map((e) => ({
      ExpenseNumber: e.expenseNumber,
      Category: (e.category as unknown as { name: string })?.name ?? '',
      Description: e.description,
      Amount: e.amount,
      Date: e.expenseDate.toISOString().split('T')[0],
      PaidBy: e.paidBy,
      Status: e.status,
    }));
    return sendCsvResponse(res, 'expenses.csv', rows);
  }

  sendResponse(res, 200, { expenses: items }, 'Finance report', pagination);
});

export const getFinanceSummaryReport = asyncHandler(async (req: Request, res: Response) => {
  const query = dateRangeSchema.parse(req.query);
  const data = await reportsService.getFinanceSummaryReport(query);
  sendResponse(res, 200, data, 'Finance summary');
});

// ── HR (T64) ──────────────────────────────────────────────────────────────────

export const getEmployeeListReport = asyncHandler(async (req: Request, res: Response) => {
  const query = hrReportQuerySchema.parse(req.query);
  const { items, pagination } = await reportsService.getEmployeeListReport(query);

  if (req.query.format === 'csv') {
    const rows = items.map((e) => ({
      EmployeeID: e.employeeId,
      Name: e.name,
      Department: (e.department as unknown as { name: string })?.name ?? '',
      Designation: e.designation,
      JoiningDate: e.joiningDate.toISOString().split('T')[0],
      Status: e.status,
      CurrentSalary: e.currentSalary,
    }));
    return sendCsvResponse(res, 'employees.csv', rows);
  }

  sendResponse(res, 200, { employees: items }, 'Employee list report', pagination);
});

export const getAttendanceSummaryReport = asyncHandler(async (req: Request, res: Response) => {
  const query = hrReportQuerySchema.parse(req.query);
  const data = await reportsService.getAttendanceSummaryReport(query);

  if (req.query.format === 'csv') {
    return sendCsvResponse(res, 'attendance-summary.csv', data as unknown as Record<string, unknown>[]);
  }

  sendResponse(res, 200, { summary: data }, 'Attendance summary report');
});

export const getPayrollSummaryReport = asyncHandler(async (req: Request, res: Response) => {
  const query = hrReportQuerySchema.parse(req.query);
  const { items, pagination, totals } = await reportsService.getPayrollSummaryReport(query);

  if (req.query.format === 'csv') {
    const rows = items.map((p) => ({
      PayrollNumber: p.payrollNumber,
      Employee: (p.employee as unknown as { name: string })?.name ?? '',
      EmployeeID: (p.employee as unknown as { employeeId: string })?.employeeId ?? '',
      Month: p.period.month,
      Year: p.period.year,
      GrossSalary: p.grossSalary,
      NetSalary: p.netSalary,
      Status: p.status,
    }));
    return sendCsvResponse(res, 'payroll-summary.csv', rows);
  }

  sendResponse(res, 200, { payrolls: items, totals }, 'Payroll summary report', pagination);
});
