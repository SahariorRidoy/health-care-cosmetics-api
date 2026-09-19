import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ISupplierPaymentDocument extends Document {
  paymentNumber: string;
  supplier: Types.ObjectId;
  purchaseOrder?: Types.ObjectId;
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

const supplierPaymentSchema = new Schema<ISupplierPaymentDocument>(
  {
    paymentNumber: { type: String, required: true, unique: true, trim: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    purchaseOrder: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },
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

supplierPaymentSchema.index({ supplier: 1, createdAt: -1 });
supplierPaymentSchema.index({ purchaseOrder: 1 });

export const SupplierPayment = mongoose.model<ISupplierPaymentDocument>('SupplierPayment', supplierPaymentSchema);
