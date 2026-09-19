import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IAllowanceDeduction {
  label: string;
  amount: number;
}

export interface ISalaryStructureDocument extends Document {
  employee: Types.ObjectId;
  baseSalary: number;
  allowances: IAllowanceDeduction[];
  deductions: IAllowanceDeduction[];
  effectiveDate: Date;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const allowanceDeductionSchema = new Schema<IAllowanceDeduction>(
  {
    label: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const salaryStructureSchema = new Schema<ISalaryStructureDocument>(
  {
    employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    baseSalary: { type: Number, required: true, min: 0 },
    allowances: { type: [allowanceDeductionSchema], default: [] },
    deductions: { type: [allowanceDeductionSchema], default: [] },
    effectiveDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

salaryStructureSchema.index({ employee: 1, effectiveDate: -1 });

export const SalaryStructure = mongoose.model<ISalaryStructureDocument>(
  'SalaryStructure',
  salaryStructureSchema,
);
