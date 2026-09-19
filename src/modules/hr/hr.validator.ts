import { z } from 'zod';

// ── Employee (T54) ────────────────────────────────────────────────────────────

export const createEmployeeSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  email: z.string().email().trim().optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  department: z.string().min(1, 'Department is required'),
  designation: z.string().min(1, 'Designation is required').trim(),
  joiningDate: z.string().min(1, 'Joining date is required'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TERMINATED']).default('ACTIVE'),
  currentSalary: z.number().min(0).default(0),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

// ── Salary Structure (T55) ────────────────────────────────────────────────────

const lineItemSchema = z.object({
  label: z.string().min(1).trim(),
  amount: z.number().min(0),
});

export const createSalaryStructureSchema = z.object({
  employee: z.string().min(1, 'Employee is required'),
  baseSalary: z.number().min(0, 'Base salary must be non-negative'),
  allowances: z.array(lineItemSchema).default([]),
  deductions: z.array(lineItemSchema).default([]),
  effectiveDate: z.string().min(1, 'Effective date is required'),
});

export const updateSalaryStructureSchema = createSalaryStructureSchema.partial();

// ── Attendance (T56) ──────────────────────────────────────────────────────────

export const createAttendanceSchema = z.object({
  employee: z.string().min(1, 'Employee is required'),
  date: z.string().min(1, 'Date is required'),
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY']),
  notes: z.string().trim().optional(),
});

export const bulkAttendanceSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  records: z.array(
    z.object({
      employee: z.string().min(1),
      status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY']),
      notes: z.string().trim().optional(),
    }),
  ).min(1),
});

export const updateAttendanceSchema = z.object({
  status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY']),
  notes: z.string().trim().optional(),
});

// ── Leave (T57) ───────────────────────────────────────────────────────────────

export const createLeaveSchema = z.object({
  employee: z.string().min(1, 'Employee is required'),
  leaveType: z.enum(['ANNUAL', 'SICK', 'CASUAL', 'UNPAID', 'OTHER']),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  reason: z.string().min(1, 'Reason is required').trim(),
  notes: z.string().trim().optional(),
});

export const updateLeaveStatusSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'CANCELLED']),
  notes: z.string().trim().optional(),
});

// ── Payroll (T58) ─────────────────────────────────────────────────────────────

export const generatePayrollSchema = z.object({
  employee: z.string().min(1, 'Employee is required'),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020),
  notes: z.string().trim().optional(),
});

export const bulkGeneratePayrollSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020),
});

export const updatePayrollStatusSchema = z.object({
  status: z.enum(['APPROVED', 'PAID']),
});
