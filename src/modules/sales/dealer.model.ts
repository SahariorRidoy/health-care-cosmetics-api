import mongoose, { Document, Schema } from 'mongoose';

export interface IDealerDocument extends Document {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  commissionRate: number; // default commission % 0–25
  balance: number;        // outstanding receivable (positive = they owe us)
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const dealerSchema = new Schema<IDealerDocument>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    commissionRate: { type: Number, default: 0, min: 0, max: 25 },
    balance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

dealerSchema.index({ name: 'text' });
dealerSchema.index({ isActive: 1 });

export const Dealer = mongoose.model<IDealerDocument>('Dealer', dealerSchema);
