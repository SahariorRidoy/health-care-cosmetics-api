import mongoose from 'mongoose';
import { Employee } from './employee.model';
import { SalaryStructure } from './salaryStructure.model';
import { Attendance } from './attendance.model';
import { Leave } from './leave.model';
import { Payroll } from './payroll.model';
import { Department } from './department.model';
import { AppError } from '../../common/utils/errors';
import { parsePagination, buildPagination } from '../../common/utils/response';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function generateEmployeeId(): Promise<string> {
  const count = await Employee.countDocuments();
  return `EMP-${String(count + 1).padStart(4, '0')}`;
}

async function generatePayrollNumber(month: number, year: number): Promise<string> {
  const prefix = `PAY-${year}${String(month).padStart(2, '0')}`;
  const count = await Payroll.countDocuments({ 'period.year': year, 'period.month': month });
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
}

function calcDays(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1);
}

// ── Employee (T54) ────────────────────────────────────────────────────────────

export async function getEmployees(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = { isActive: true };
  if (query.department) filter.department = query.department;
  if (query.status) filter.status = query.status;
  if (query.search) filter.$text = { $search: String(query.search) };

  const [items, total] = await Promise.all([
    Employee.find(filter)
      .populate('department', 'name')
      .populate('createdBy', 'name')
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit),
    Employee.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getEmployeeById(id: string) {
  const emp = await Employee.findById(id)
    .populate('department', 'name')
    .populate('createdBy', 'name');
  if (!emp || !emp.isActive) throw new AppError('Employee not found', 404);
  return emp;
}

export async function createEmployee(
  data: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    department: string;
    designation: string;
    joiningDate: string;
    status: 'ACTIVE' | 'INACTIVE' | 'TERMINATED';
    currentSalary: number;
  },
  createdBy: string,
) {
  const dept = await Department.findById(data.department);
  if (!dept || !dept.isActive) throw new AppError('Department not found', 404);

  const employeeId = await generateEmployeeId();
  return Employee.create({ ...data, employeeId, createdBy });
}

export async function updateEmployee(
  id: string,
  data: Partial<{
    name: string;
    email: string;
    phone: string;
    address: string;
    department: string;
    designation: string;
    joiningDate: string;
    status: 'ACTIVE' | 'INACTIVE' | 'TERMINATED';
    currentSalary: number;
  }>,
) {
  if (data.department) {
    const dept = await Department.findById(data.department);
    if (!dept || !dept.isActive) throw new AppError('Department not found', 404);
  }
  const emp = await Employee.findByIdAndUpdate(id, data, { new: true, runValidators: true })
    .populate('department', 'name');
  if (!emp || !emp.isActive) throw new AppError('Employee not found', 404);
  return emp;
}

export async function deleteEmployee(id: string) {
  const emp = await Employee.findByIdAndUpdate(id, { isActive: false }, { new: true });
  if (!emp) throw new AppError('Employee not found', 404);
  return emp;
}

// ── Salary Structure (T55) ────────────────────────────────────────────────────

export async function getSalaryStructures(employeeId: string) {
  return SalaryStructure.find({ employee: employeeId, isActive: true })
    .populate('employee', 'name employeeId')
    .sort({ effectiveDate: -1 });
}

export async function getActiveSalaryStructure(employeeId: string) {
  return SalaryStructure.findOne({ employee: employeeId, isActive: true })
    .sort({ effectiveDate: -1 });
}

export async function createSalaryStructure(
  data: {
    employee: string;
    baseSalary: number;
    allowances: { label: string; amount: number }[];
    deductions: { label: string; amount: number }[];
    effectiveDate: string;
  },
  createdBy: string,
) {
  const emp = await Employee.findById(data.employee);
  if (!emp || !emp.isActive) throw new AppError('Employee not found', 404);

  const totalAllowances = data.allowances.reduce((s, a) => s + a.amount, 0);
  const grossSalary = data.baseSalary + totalAllowances;

  // Update employee's currentSalary to reflect latest structure
  const totalDeductions = data.deductions.reduce((s, d) => s + d.amount, 0);
  await Employee.findByIdAndUpdate(data.employee, { currentSalary: grossSalary - totalDeductions });

  return SalaryStructure.create({ ...data, createdBy });
}

export async function updateSalaryStructure(
  id: string,
  data: Partial<{
    baseSalary: number;
    allowances: { label: string; amount: number }[];
    deductions: { label: string; amount: number }[];
    effectiveDate: string;
  }>,
) {
  const structure = await SalaryStructure.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!structure || !structure.isActive) throw new AppError('Salary structure not found', 404);
  return structure;
}

// ── Attendance (T56) ──────────────────────────────────────────────────────────

export async function getAttendance(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = {};
  if (query.employee) filter.employee = query.employee;
  if (query.from || query.to) {
    filter.date = {
      ...(query.from ? { $gte: new Date(String(query.from)) } : {}),
      ...(query.to ? { $lte: new Date(String(query.to)) } : {}),
    };
  }
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    Attendance.find(filter)
      .populate('employee', 'name employeeId')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit),
    Attendance.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function upsertAttendance(
  data: { employee: string; date: string; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY'; notes?: string },
  createdBy: string,
) {
  const emp = await Employee.findById(data.employee);
  if (!emp || !emp.isActive) throw new AppError('Employee not found', 404);

  const date = new Date(data.date);
  return Attendance.findOneAndUpdate(
    { employee: data.employee, date },
    { ...data, date, createdBy },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
}

export async function bulkUpsertAttendance(
  date: string,
  records: { employee: string; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY'; notes?: string }[],
  createdBy: string,
) {
  const parsedDate = new Date(date);
  const ops = records.map((r) => ({
    updateOne: {
      filter: { employee: new mongoose.Types.ObjectId(r.employee), date: parsedDate },
      update: { $set: { status: r.status, notes: r.notes, date: parsedDate, createdBy: new mongoose.Types.ObjectId(createdBy) } },
      upsert: true,
    },
  }));
  return Attendance.bulkWrite(ops);
}

export async function updateAttendance(
  id: string,
  data: { status: 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY'; notes?: string },
) {
  const record = await Attendance.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  if (!record) throw new AppError('Attendance record not found', 404);
  return record;
}

// ── Leave (T57) ───────────────────────────────────────────────────────────────

export async function getLeaves(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = {};
  if (query.employee) filter.employee = query.employee;
  if (query.status) filter.status = query.status;
  if (query.leaveType) filter.leaveType = query.leaveType;

  const [items, total] = await Promise.all([
    Leave.find(filter)
      .populate('employee', 'name employeeId')
      .sort({ startDate: -1 })
      .skip(skip)
      .limit(limit),
    Leave.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getLeaveById(id: string) {
  const leave = await Leave.findById(id).populate('employee', 'name employeeId');
  if (!leave) throw new AppError('Leave record not found', 404);
  return leave;
}

export async function createLeave(
  data: {
    employee: string;
    leaveType: 'ANNUAL' | 'SICK' | 'CASUAL' | 'UNPAID' | 'OTHER';
    startDate: string;
    endDate: string;
    reason: string;
    notes?: string;
  },
  createdBy: string,
) {
  const emp = await Employee.findById(data.employee);
  if (!emp || !emp.isActive) throw new AppError('Employee not found', 404);

  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  if (end < start) throw new AppError('End date must be on or after start date', 400);

  const totalDays = calcDays(start, end);
  return Leave.create({ ...data, startDate: start, endDate: end, totalDays, createdBy });
}

export async function updateLeaveStatus(
  id: string,
  status: 'APPROVED' | 'REJECTED' | 'CANCELLED',
  notes?: string,
) {
  const leave = await Leave.findById(id);
  if (!leave) throw new AppError('Leave record not found', 404);
  if (leave.status === 'CANCELLED') throw new AppError('Cannot update a cancelled leave', 400);

  leave.status = status;
  if (notes) leave.notes = notes;
  return leave.save();
}

// ── Payroll (T58) ─────────────────────────────────────────────────────────────

export async function getPayrolls(query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const filter: Record<string, unknown> = {};
  if (query.employee) filter.employee = query.employee;
  if (query.status) filter.status = query.status;
  if (query.month) filter['period.month'] = Number(query.month);
  if (query.year) filter['period.year'] = Number(query.year);

  const [items, total] = await Promise.all([
    Payroll.find(filter)
      .populate('employee', 'name employeeId department')
      .sort({ 'period.year': -1, 'period.month': -1 })
      .skip(skip)
      .limit(limit),
    Payroll.countDocuments(filter),
  ]);

  return { items, pagination: buildPagination(page, limit, total) };
}

export async function getPayrollById(id: string) {
  const payroll = await Payroll.findById(id).populate('employee', 'name employeeId department');
  if (!payroll) throw new AppError('Payroll record not found', 404);
  return payroll;
}

export async function generatePayroll(
  data: { employee: string; month: number; year: number; notes?: string },
  createdBy: string,
) {
  const emp = await Employee.findById(data.employee);
  if (!emp || !emp.isActive) throw new AppError('Employee not found', 404);

  // Prevent duplicate payroll for same period
  const existing = await Payroll.findOne({
    employee: data.employee,
    'period.month': data.month,
    'period.year': data.year,
  });
  if (existing) throw new AppError('Payroll already generated for this employee and period', 409);

  // Get active salary structure
  const structure = await SalaryStructure.findOne({ employee: data.employee, isActive: true })
    .sort({ effectiveDate: -1 });
  if (!structure) throw new AppError('No active salary structure found for this employee', 400);

  // Count attendance for the period
  const periodStart = new Date(data.year, data.month - 1, 1);
  const periodEnd = new Date(data.year, data.month, 0); // last day of month

  const attendanceSummary = await Attendance.aggregate([
    {
      $match: {
        employee: emp._id,
        date: { $gte: periodStart, $lte: periodEnd },
      },
    },
    {
      $group: {
        _id: null,
        present: { $sum: { $cond: [{ $in: ['$status', ['PRESENT', 'LATE']] }, 1, 0] } },
        halfDay: { $sum: { $cond: [{ $eq: ['$status', 'HALF_DAY'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] }, 1, 0] } },
      },
    },
  ]);

  const summary = attendanceSummary[0] ?? { present: 0, halfDay: 0, absent: 0 };
  const presentDays = summary.present + summary.halfDay * 0.5;
  const absentDays = summary.absent;

  // Server-side salary calculation — never trust client
  const totalAllowances = structure.allowances.reduce((s, a) => s + a.amount, 0);
  const totalDeductions = structure.deductions.reduce((s, d) => s + d.amount, 0);
  const grossSalary = structure.baseSalary + totalAllowances;
  const netSalary = Math.max(0, grossSalary - totalDeductions);

  const payrollNumber = await generatePayrollNumber(data.month, data.year);

  return Payroll.create({
    payrollNumber,
    employee: data.employee,
    period: { month: data.month, year: data.year },
    baseSalary: structure.baseSalary,
    allowances: structure.allowances,
    deductions: structure.deductions,
    totalAllowances,
    totalDeductions,
    grossSalary,
    netSalary,
    presentDays,
    absentDays,
    notes: data.notes,
    createdBy,
  });
}

export async function bulkGeneratePayroll(
  data: { month: number; year: number },
  createdBy: string,
) {
  const employees = await Employee.find({ isActive: true, status: 'ACTIVE' });
  const results: { employeeId: string; status: 'created' | 'skipped'; reason?: string }[] = [];

  for (const emp of employees) {
    try {
      await generatePayroll({ employee: String(emp._id), month: data.month, year: data.year }, createdBy);
      results.push({ employeeId: emp.employeeId, status: 'created' });
    } catch (err) {
      results.push({
        employeeId: emp.employeeId,
        status: 'skipped',
        reason: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return results;
}

export async function updatePayrollStatus(id: string, status: 'APPROVED' | 'PAID') {
  const payroll = await Payroll.findById(id);
  if (!payroll) throw new AppError('Payroll record not found', 404);

  const transitions: Record<string, string[]> = {
    DRAFT: ['APPROVED'],
    APPROVED: ['PAID'],
    PAID: [],
  };

  if (!transitions[payroll.status]?.includes(status)) {
    throw new AppError(`Cannot transition payroll from ${payroll.status} to ${status}`, 400);
  }

  payroll.status = status;
  if (status === 'PAID') payroll.paidAt = new Date();
  return payroll.save();
}
