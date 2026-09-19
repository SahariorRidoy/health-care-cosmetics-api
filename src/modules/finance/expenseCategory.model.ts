import mongoose, { Document, Schema } from 'mongoose';

export interface IExpenseCategoryDocument extends Document {
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const expenseCategorySchema = new Schema<IExpenseCategoryDocument>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

expenseCategorySchema.index({ isActive: 1 });

export const ExpenseCategory = mongoose.model<IExpenseCategoryDocument>('ExpenseCategory', expenseCategorySchema);
