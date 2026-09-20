import mongoose, { Document, Schema } from 'mongoose';

export interface ICustomerDocument extends Document {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  balance: number; // outstanding receivable (positive = they owe us)
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<ICustomerDocument>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    balance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

customerSchema.index({ name: 'text' });
customerSchema.index({ isActive: 1 });

export const Customer = mongoose.model<ICustomerDocument>('Customer', customerSchema);
