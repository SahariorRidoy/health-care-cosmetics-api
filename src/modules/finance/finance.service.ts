import { ExpenseCategory } from './expenseCategory.model';
import { Expense, ExpenseStatus } from './expense.model';
import { Supplier } from '../procurement/supplier.model';
import { Customer } from '../sales/customer.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function generateExpenseNumber(): Promise<string> {
  const d = new Date();
  const prefix = `EXP-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const count = await Expense.countDocuments({ expenseNumber: { $regex: `^${prefix}` } });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

// ── Expense Categories (T50) ──────────────────────────────────────────────────

export async function getExpenseCategories() {
  return ExpenseCategory.find({ isActive: true }).sort({ name: 1 });
}

export async function getExpenseCategoryById(id: string) {
  const cat = await ExpenseCategory.findById(id);
  if (!cat || !cat.isActive) throw new AppError('Expense category not found', 404);
  return cat;
}

export async function createExpenseCategory(data: { name: string; description?: string }) {
  const exists = await ExpenseCategory.findOne({ name: { $regex: `^${data.name}$`, $options: 'i' } });
  if (exists) throw new AppError('Expense category with this name already exists', 409);
  return ExpenseCategory.create(data);
}

export async function updateExpenseCategory(
  id: string,
  data: Partial<{ name: string; description: string; isActive: boolean }>,
) {
  const cat = await ExpenseCategory.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!cat) throw new AppError('Expense category not found', 404);
  return cat;
}

export async function deleteExpenseCategory(id: string) {
  const cat = await ExpenseCategory.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!cat) throw new AppError('Expense category not found', 404);
  return cat;
}

// ── Expenses (T51) ────────────────────────────────────────────────────────────

export async function getExpenses(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);

  const filter: Record<string, unknown> = { isActive: true };
  if (query.category) filter.category = query.category;
  if (query.status) filter.status = query.status;
  if (query.from || query.to) {
    filter.expenseDate = {
      ...(query.from ? { $gte: new Date(String(query.from)) } : {}),
      ...(query.to ? { $lte: new Date(String(query.to)) } : {}),
    };
  }

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

export async function getExpenseById(id: string) {
  const expense = await Expense.findById(id)
    .populate('category', 'name')
    .populate('createdBy', 'name');
  if (!expense || !expense.isActive) throw new AppError('Expense not found', 404);
  return expense;
}

export async function createExpense(
  data: {
    category: string;
    description: string;
    amount: number;
    expenseDate?: string;
    paidBy: string;
    status: ExpenseStatus;
    reference?: string;
    notes?: string;
  },
  createdBy: string,
) {
  const cat = await ExpenseCategory.findById(data.category);
  if (!cat || !cat.isActive) throw new AppError('Expense category not found', 404);

  const expenseNumber = await generateExpenseNumber();
  return Expense.create({ ...data, expenseNumber, createdBy });
}

export async function updateExpense(
  id: string,
  data: Partial<{
    category: string;
    description: string;
    amount: number;
    expenseDate: string;
    paidBy: string;
    status: ExpenseStatus;
    reference: string;
    notes: string;
  }>,
) {
  const expense = await Expense.findById(id);
  if (!expense || !expense.isActive) throw new AppError('Expense not found', 404);

  if (data.category) {
    const cat = await ExpenseCategory.findById(data.category);
    if (!cat || !cat.isActive) throw new AppError('Expense category not found', 404);
  }

  return Expense.findByIdAndUpdate(id, data, { new: true, runValidators: true });
}

export async function updateExpenseStatus(id: string, status: ExpenseStatus) {
  const expense = await Expense.findById(id);
  if (!expense || !expense.isActive) throw new AppError('Expense not found', 404);
  expense.status = status;
  return expense.save();
}

export async function deleteExpense(id: string) {
  const expense = await Expense.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!expense) throw new AppError('Expense not found', 404);
  return expense;
}

// ── Finance Summary (T52) ─────────────────────────────────────────────────────

export async function getFinanceSummary(query: { from?: string; to?: string }) {
  const dateFilter: Record<string, Date> = {};
  if (query.from) dateFilter.$gte = new Date(query.from);
  if (query.to) dateFilter.$lte = new Date(query.to);

  const expenseDateFilter = Object.keys(dateFilter).length
    ? { expenseDate: dateFilter }
    : {};

  const [expenseAgg, expenseByCategory, payablesAgg, receivablesAgg] = await Promise.all([
    Expense.aggregate([
      { $match: { isActive: true, ...expenseDateFilter } },
      { $group: { _id: '$status', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Expense.aggregate([
      { $match: { isActive: true, ...expenseDateFilter } },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      {
        $lookup: {
          from: 'expensecategories',
          localField: '_id',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: '$category' },
      { $project: { categoryName: '$category.name', total: 1, count: 1 } },
      { $sort: { total: -1 } },
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

  const expenseMap = Object.fromEntries(
    expenseAgg.map((e) => [e._id as string, { total: e.total as number, count: e.count as number }]),
  );

  return {
    expenses: {
      paid: expenseMap['PAID'] ?? { total: 0, count: 0 },
      pending: expenseMap['PENDING'] ?? { total: 0, count: 0 },
      total: ((expenseMap['PAID']?.total ?? 0) + (expenseMap['PENDING']?.total ?? 0)),
      byCategory: expenseByCategory,
    },
    payables: {
      total: payablesAgg[0]?.total ?? 0,
      supplierCount: payablesAgg[0]?.count ?? 0,
    },
    receivables: {
      total: receivablesAgg[0]?.total ?? 0,
      customerCount: receivablesAgg[0]?.count ?? 0,
    },
    period: {
      from: query.from ?? null,
      to: query.to ?? null,
    },
  };
}
