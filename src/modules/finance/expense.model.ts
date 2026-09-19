import mongoose, { Document, Schema, Types } from 'mongoose';

export type ExpenseStatus = 'PENDING' | 'PAID';

export interface IExpenseDocument extends Document {
  expenseNumber: string;
  category: Types.ObjectId;
  description: string;
  amount: number;
  expenseDate: Date;
  paidBy: string;
  status: ExpenseStatus;
  reference?: string;
  notes?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<IExpenseDocument>(
  {
    expenseNumber: { type: String, required: true, unique: true, trim: true },
    category: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    expenseDate: { type: Date, default: Date.now },
    paidBy: { type: String, required: true, trim: true },
    status: { type: String, enum: ['PENDING', 'PAID'], default: 'PENDING' },
    reference: { type: String, trim: true },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

expenseSchema.index({ category: 1, status: 1 });
expenseSchema.index({ expenseDate: -1 });
expenseSchema.index({ createdAt: -1 });

export const Expense = mongoose.model<IExpenseDocument>('Expense', expenseSchema);
