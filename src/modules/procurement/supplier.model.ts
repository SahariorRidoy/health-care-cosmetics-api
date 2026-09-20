import mongoose, { Document, Schema } from 'mongoose';

export interface ISupplierDocument extends Document {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  balance: number;        // outstanding payable (positive = we owe them)
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const supplierSchema = new Schema<ISupplierDocument>(
  {
    name: { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    balance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

supplierSchema.index({ name: 'text' });
supplierSchema.index({ isActive: 1 });

export const Supplier = mongoose.model<ISupplierDocument>('Supplier', supplierSchema);
