import mongoose, { Document, Schema, Types } from 'mongoose';

export type POStatus = 'DRAFT' | 'CONFIRMED' | 'RECEIVED' | 'CLOSED';

export interface IPOItem {
  item: Types.ObjectId;
  description?: string;
  orderedQty: number;
  receivedQty: number;
  unitPrice: number;
  totalPrice: number;
  uom: Types.ObjectId;
}

export type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

export interface IPurchaseOrderDocument extends Document {
  poNumber: string;
  supplier: Types.ObjectId;
  status: POStatus;
  items: IPOItem[];
  subtotal: number;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  notes?: string;
  expectedDeliveryDate?: Date;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const poItemSchema = new Schema<IPOItem>(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    description: { type: String, trim: true },
    orderedQty: { type: Number, required: true, min: 0.001 },
    receivedQty: { type: Number, default: 0, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    uom: { type: Schema.Types.ObjectId, ref: 'UOM', required: true },
  },
  { _id: false },
);

const purchaseOrderSchema = new Schema<IPurchaseOrderDocument>(
  {
    poNumber: { type: String, required: true, unique: true, trim: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'CONFIRMED', 'RECEIVED', 'CLOSED'],
      default: 'DRAFT',
    },
    items: { type: [poItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    paymentStatus: {
      type: String,
      enum: ['PAID', 'PARTIAL', 'UNPAID'],
      default: 'UNPAID',
    },
    notes: { type: String, trim: true },
    expectedDeliveryDate: { type: Date },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

purchaseOrderSchema.index({ supplier: 1, status: 1 });
purchaseOrderSchema.index({ poNumber: 'text' });
purchaseOrderSchema.index({ createdAt: -1 });

export const PurchaseOrder = mongoose.model<IPurchaseOrderDocument>('PurchaseOrder', purchaseOrderSchema);
