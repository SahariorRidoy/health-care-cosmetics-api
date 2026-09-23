import { StockMovement, StockBalance } from '../inventory/stock.model';
import { Item } from '../inventory/item.model';
import { ProductionOrder } from '../production/productionOrder.model';
import { BOM } from '../production/bom.model';
import { SalesOrder } from '../sales/salesOrder.model';
import { Invoice } from '../sales/invoice.model';
import { PurchaseOrder } from '../procurement/purchaseOrder.model';
import { GoodsReceipt } from '../procurement/goodsReceipt.model';
import { Expense } from '../finance/expense.model';
import { Supplier } from '../procurement/supplier.model';
import { Customer } from '../sales/customer.model';
import { Employee } from '../hr/employee.model';
import { Attendance } from '../hr/attendance.model';
import { Payroll } from '../hr/payroll.model';
import { buildPagination } from '../../common/utils/response';

// ── Helpers ───────────────────────────────────────────────────────────────────

function dateFilter(from?: string, to?: string): Record<string, Date> | undefined {
  if (!from && !to) return undefined;
  const f: Record<string, Date> = {};
  if (from) f.$gte = new Date(from);
  if (to) f.$lte = new Date(to);
  return f;
}

// ── T59 — Stock Report ────────────────────────────────────────────────────────

export async function getStockBalanceReport(query: {
  item?: string;
  warehouse?: string;
  lowStock?: boolean;
  page: number;
  limit: number;
}) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (query.item) filter.item = query.item;
  if (query.warehouse) filter.warehouse = query.warehouse;

  const [balances, total] = await Promise.all([
    StockBalance.find(filter)
      .populate('item', 'name sku type category reorderLevel costPrice')
      .populate('warehouse', 'name')
      .sort({ quantity: 1 })
      .skip(skip)
      .limit(limit),
    StockBalance.countDocuments(filter),
  ]);

  const rows = balances.map((b) => {
    const item = b.item as unknown as {
      name: string; sku: string; type: string; category: string;
      reorderLevel: number; costPrice: number;
    };
    return {
      ...b.toObject(),
      isLowStock: item?.reorderLevel !== undefined && b.quantity <= item.reorderLevel,
      valuation: item?.costPrice ? b.quantity * item.costPrice : 0,
    };
  });

  const filtered = query.lowStock ? rows.filter((r) => r.isLowStock) : rows;

  return { items: filtered, pagination: buildPagination(page, limit, total) };
}

export async function getStockMovementReport(query: {
  item?: string;
  warehouse?: string;
  type?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (query.item) filter.item = query.item;
  if (query.warehouse) filter.warehouse = query.warehouse;
  if (query.type) filter.type = query.type;
  const df = dateFilter(query.from, query.to);
  if (df) filter.createdAt = df;

  const [items, total] = await Promise.all([
    StockMovement.find(filter)
      .populate('item', 'name sku')
      .populate('warehouse', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    StockMovement.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getLowStockItems() {
  const items = await Item.find({ isActive: true }).populate('baseUom', 'symbol');
  return items.filter((i) => i.currentStock <= i.reorderLevel);
}

export async function getStockValuation(query: { warehouse?: string }) {
  const balances = await StockBalance.find(query.warehouse ? { warehouse: query.warehouse } : {})
    .populate('item', 'name sku costPrice type category');

  let totalValue = 0;
  const rows = balances.map((b) => {
    const item = b.item as unknown as { name: string; sku: string; costPrice: number; type: string; category: string };
    const value = (item?.costPrice ?? 0) * b.quantity;
    totalValue += value;
    return { item: item?.name, sku: item?.sku, type: item?.type, category: item?.category, quantity: b.quantity, costPrice: item?.costPrice ?? 0, value };
  });

  return { rows, totalValue };
}

// ── T60 — Production Report ───────────────────────────────────────────────────

export async function getProductionReport(query: {
  product?: string;
  status?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { isActive: true };
  if (query.product) filter.product = query.product;
  if (query.status) filter.status = query.status;
  const df = dateFilter(query.from, query.to);
  if (df) filter.createdAt = df;

  const [items, total] = await Promise.all([
    ProductionOrder.find(filter)
      .populate('product', 'name sku')
      .populate('warehouse', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    ProductionOrder.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getProductionSummary(query: { from?: string; to?: string }) {
  const df = dateFilter(query.from, query.to);
  const matchStage = { isActive: true, ...(df ? { createdAt: df } : {}) };

  const [summary, materialConsumption, wastageSummary] = await Promise.all([
    ProductionOrder.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalPlanned: { $sum: '$plannedQty' },
          totalOutput: { $sum: '$actualOutputQty' },
          totalWastage: { $sum: '$wastageQty' },
        },
      },
    ]),
    ProductionOrder.aggregate([
      { $match: { ...matchStage, status: { $in: ['COMPLETED', 'CLOSED'] } } },
      { $unwind: '$materials' },
      {
        $group: {
          _id: '$materials.item',
          totalIssued: { $sum: '$materials.issuedQty' },
          totalConsumed: { $sum: '$materials.actualConsumedQty' },
        },
      },
      {
        $lookup: { from: 'items', localField: '_id', foreignField: '_id', as: 'item' },
      },
      { $unwind: '$item' },
      { $project: { itemName: '$item.name', sku: '$item.sku', totalIssued: 1, totalConsumed: 1 } },
      { $sort: { totalConsumed: -1 } },
      { $limit: 20 },
    ]),
    ProductionOrder.aggregate([
      { $match: { ...matchStage, wastageQty: { $gt: 0 } } },
      {
        $group: {
          _id: '$product',
          totalWastage: { $sum: '$wastageQty' },
          totalOutput: { $sum: '$actualOutputQty' },
          count: { $sum: 1 },
        },
      },
      { $lookup: { from: 'items', localField: '_id', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
      { $project: { productName: '$product.name', totalWastage: 1, totalOutput: 1, count: 1 } },
      { $sort: { totalWastage: -1 } },
    ]),
  ]);

  return { summary, materialConsumption, wastageSummary };
}

// ── T61 — Sales Report ────────────────────────────────────────────────────────

export async function getSalesReport(query: {
  customer?: string;
  status?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { isActive: true };
  if (query.customer) filter.customer = query.customer;
  if (query.status) filter.status = query.status;
  const df = dateFilter(query.from, query.to);
  if (df) filter.createdAt = df;

  const [items, total] = await Promise.all([
    SalesOrder.find(filter)
      .populate('customer', 'name')
      .populate('warehouse', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    SalesOrder.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getSalesSummary(query: { from?: string; to?: string }) {
  const df = dateFilter(query.from, query.to);
  const matchStage = { isActive: true, ...(df ? { createdAt: df } : {}) };

  const [orderSummary, invoiceSummary, topCustomers, topProducts] = await Promise.all([
    SalesOrder.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
        },
      },
    ]),
    Invoice.aggregate([
      { $match: { isActive: true, ...(df ? { createdAt: df } : {}) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
          paidAmount: { $sum: '$paidAmount' },
          dueAmount: { $sum: '$dueAmount' },
        },
      },
    ]),
    Invoice.aggregate([
      { $match: { isActive: true, ...(df ? { createdAt: df } : {}) } },
      { $group: { _id: '$customer', totalAmount: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
      { $unwind: '$customer' },
      { $project: { customerName: '$customer.name', totalAmount: 1, count: 1 } },
      { $sort: { totalAmount: -1 } },
      { $limit: 10 },
    ]),
    SalesOrder.aggregate([
      { $match: { ...matchStage, status: { $in: ['ACTIVE'] } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.item',
          totalQty: { $sum: '$items.qty' },
          totalRevenue: { $sum: '$items.lineTotal' },
        },
      },
      { $lookup: { from: 'items', localField: '_id', foreignField: '_id', as: 'item' } },
      { $unwind: '$item' },
      { $project: { itemName: '$item.name', sku: '$item.sku', totalQty: 1, totalRevenue: 1 } },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
    ]),
  ]);

  return { orderSummary, invoiceSummary, topCustomers, topProducts };
}

// ── T62 — Purchase Report ─────────────────────────────────────────────────────

export async function getPurchaseReport(query: {
  supplier?: string;
  status?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { isActive: true };
  if (query.supplier) filter.supplier = query.supplier;
  if (query.status) filter.status = query.status;
  const df = dateFilter(query.from, query.to);
  if (df) filter.createdAt = df;

  const [items, total] = await Promise.all([
    PurchaseOrder.find(filter)
      .populate('supplier', 'name code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    PurchaseOrder.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getPurchaseSummary(query: { from?: string; to?: string }) {
  const df = dateFilter(query.from, query.to);
  const matchStage = { isActive: true, ...(df ? { createdAt: df } : {}) };

  const [orderSummary, receivingSummary, topSuppliers, supplierDues] = await Promise.all([
    PurchaseOrder.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
        },
      },
    ]),
    GoodsReceipt.aggregate([
      { $match: { isActive: true, ...(df ? { createdAt: df } : {}) } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' },
        },
      },
    ]),
    PurchaseOrder.aggregate([
      { $match: matchStage },
      { $group: { _id: '$supplier', totalAmount: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
      { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'supplier' } },
      { $unwind: '$supplier' },
      { $project: { supplierName: '$supplier.name', totalAmount: 1, count: 1 } },
      { $sort: { totalAmount: -1 } },
      { $limit: 10 },
    ]),
    Supplier.find({ isActive: true, balance: { $gt: 0 } })
      .select('name code balance')
      .sort({ balance: -1 })
      .limit(10),
  ]);

  return { orderSummary, receivingSummary: receivingSummary[0] ?? { count: 0, totalAmount: 0 }, topSuppliers, supplierDues };
}

// ── T63 — Finance Report ──────────────────────────────────────────────────────

export async function getFinanceReport(query: {
  category?: string;
  status?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { isActive: true };
  if (query.category) filter.category = query.category;
  if (query.status) filter.status = query.status;
  const df = dateFilter(query.from, query.to);
  if (df) filter.expenseDate = df;

  const [items, total] = await Promise.all([
    Expense.find(filter)
      .populate('category', 'name')
      .populate('createdBy', 'name')
      .sort({ expenseDate: -1 })
      .skip(skip)
      .limit(limit),
    Expense.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getFinanceSummaryReport(query: { from?: string; to?: string }) {
  const df = dateFilter(query.from, query.to);
  const expenseDateFilter = df ? { expenseDate: df } : {};

  const [expenseByCategory, expenseByStatus, payables, receivables] = await Promise.all([
    Expense.aggregate([
      { $match: { isActive: true, ...expenseDateFilter } },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $lookup: { from: 'expensecategories', localField: '_id', foreignField: '_id', as: 'category' } },
      { $unwind: '$category' },
      { $project: { categoryName: '$category.name', total: 1, count: 1 } },
      { $sort: { total: -1 } },
    ]),
    Expense.aggregate([
      { $match: { isActive: true, ...expenseDateFilter } },
      { $group: { _id: '$status', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Supplier.aggregate([
      { $match: { isActive: true, balance: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$balance' }, count: { $sum: 1 } } },
    ]),
    Customer.aggregate([
      { $match: { isActive: true, balance: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$balance' }, count: { $sum: 1 } } },
    ]),
  ]);

  return {
    expenseByCategory,
    expenseByStatus,
    payables: payables[0] ?? { total: 0, count: 0 },
    receivables: receivables[0] ?? { total: 0, count: 0 },
  };
}

// ── T64 — HR Report ───────────────────────────────────────────────────────────

export async function getEmployeeListReport(query: {
  department?: string;
  page: number;
  limit: number;
}) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { isActive: true };
  if (query.department) filter.department = query.department;

  const [items, total] = await Promise.all([
    Employee.find(filter)
      .populate('department', 'name')
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit),
    Employee.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getAttendanceSummaryReport(query: {
  employee?: string;
  department?: string;
  from?: string;
  to?: string;
}) {
  const df = dateFilter(query.from, query.to);
  const matchStage: Record<string, unknown> = {};
  if (query.employee) matchStage.employee = query.employee;
  if (df) matchStage.date = df;

  const summary = await Attendance.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$employee',
        present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'LATE'] }, 1, 0] } },
        halfDay: { $sum: { $cond: [{ $eq: ['$status', 'HALF_DAY'] }, 1, 0] } },
        total: { $sum: 1 },
      },
    },
    { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'employee' } },
    { $unwind: '$employee' },
    {
      $project: {
        employeeName: '$employee.name',
        employeeId: '$employee.employeeId',
        present: 1, absent: 1, late: 1, halfDay: 1, total: 1,
      },
    },
    { $sort: { employeeName: 1 } },
  ]);

  return summary;
}

export async function getPayrollSummaryReport(query: {
  month?: number;
  year?: number;
  department?: string;
  page: number;
  limit: number;
}) {
  const { page, limit } = query;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  if (query.month) filter['period.month'] = query.month;
  if (query.year) filter['period.year'] = query.year;

  const [items, total, totals] = await Promise.all([
    Payroll.find(filter)
      .populate('employee', 'name employeeId department')
      .sort({ 'period.year': -1, 'period.month': -1, })
      .skip(skip)
      .limit(limit),
    Payroll.countDocuments(filter),
    Payroll.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalGross: { $sum: '$grossSalary' },
          totalNet: { $sum: '$netSalary' },
        },
      },
    ]),
  ]);

  return { items, pagination: buildPagination(page, limit, total), totals };
}
