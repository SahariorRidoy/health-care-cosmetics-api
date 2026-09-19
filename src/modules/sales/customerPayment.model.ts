import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICustomerPaymentDocument extends Document {
  receiptNumber: string;
  customer: Types.ObjectId;
  invoice: Types.ObjectId;
  amount: number;
  paymentDate: Date;
  method: string;
  reference?: string;
  notes?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const customerPaymentSchema = new Schema<ICustomerPaymentDocument>(
  {
    receiptNumber: { type: String, required: true, unique: true, trim: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    paymentDate: { type: Date, default: Date.now },
    method: { type: String, required: true, trim: true },
    reference: { type: String, trim: true },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

customerPaymentSchema.index({ customer: 1, createdAt: -1 });
customerPaymentSchema.index({ invoice: 1 });

export const CustomerPayment = mongoose.model<ICustomerPaymentDocument>('CustomerPayment', customerPaymentSchema);
