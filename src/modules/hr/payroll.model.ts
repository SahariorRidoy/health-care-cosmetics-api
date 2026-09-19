import mongoose, { Document, Schema, Types } from 'mongoose';

export type PayrollStatus = 'DRAFT' | 'APPROVED' | 'PAID';

export interface IPayrollDocument extends Document {
  payrollNumber: string;
  employee: Types.ObjectId;
  period: { month: number; year: number };
  baseSalary: number;
  allowances: { label: string; amount: number }[];
  deductions: { label: string; amount: number }[];
  totalAllowances: number;
  totalDeductions: number;
  grossSalary: number;
  netSalary: number;
  presentDays: number;
  absentDays: number;
  status: PayrollStatus;
  paidAt?: Date;
  notes?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const lineItemSchema = new Schema({ label: String, amount: Number }, { _id: false });

const payrollSchema = new Schema<IPayrollDocument>(
  {
    payrollNumber: { type: String, required: true, unique: true, trim: true },
    employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    period: {
      month: { type: Number, required: true, min: 1, max: 12 },
      year: { type: Number, required: true },
    },
    baseSalary: { type: Number, required: true, min: 0 },
    allowances: { type: [lineItemSchema], default: [] },
    deductions: { type: [lineItemSchema], default: [] },
    totalAllowances: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    grossSalary: { type: Number, required: true, min: 0 },
    netSalary: { type: Number, required: true, min: 0 },
    presentDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    status: { type: String, enum: ['DRAFT', 'APPROVED', 'PAID'], default: 'DRAFT' },
    paidAt: { type: Date },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

// One payroll per employee per period
payrollSchema.index({ employee: 1, 'period.year': 1, 'period.month': 1 }, { unique: true });
payrollSchema.index({ status: 1 });

export const Payroll = mongoose.model<IPayrollDocument>('Payroll', payrollSchema);
