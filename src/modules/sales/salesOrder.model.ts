import mongoose, { Document, Schema, Types } from 'mongoose';

export type SalesOrderStatus = 'ACTIVE' | 'CANCELLED';

export interface ISalesOrderItem {
  item: Types.ObjectId;
  description?: string;
  qty: number;
  giftQty: number;
  unitPrice: number;
  commissionRate: number;   // snapshot per line
  commissionAmount: number; // qty * unitPrice * commissionRate/100
  lineTotal: number;        // qty * unitPrice * (1 - commissionRate/100)
  uom: Types.ObjectId;
}

export interface ISalesOrderDocument extends Document {
  orderNumber: string;
  dealer: Types.ObjectId;
  status: SalesOrderStatus;
  items: ISalesOrderItem[];
  grossAmount: number;      // sum of qty * unitPrice (before commission)
  totalCommission: number;  // sum of commissionAmount per line
  subtotal: number;         // net amount dealer pays (grossAmount - totalCommission)
  taxPercent: number;
  taxAmount: number;
  totalAmount: number;      // subtotal + tax
  commissionRate: number;   // invoice-level default (kept for backward compat)
  commissionAmount: number; // = totalCommission
  notes?: string;
  deliveryDate?: Date;
  warehouse: Types.ObjectId;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const soItemSchema = new Schema<ISalesOrderItem>(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    description: { type: String, trim: true },
    qty: { type: Number, required: true, min: 0.001 },
    giftQty: { type: Number, default: 0, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    commissionRate: { type: Number, default: 0, min: 0, max: 100 },
    commissionAmount: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    uom: { type: Schema.Types.ObjectId, ref: 'UOM', required: true },
  },
  { _id: false },
);

const salesOrderSchema = new Schema<ISalesOrderDocument>(
  {
    orderNumber: { type: String, required: true, unique: true, trim: true },
    dealer: { type: Schema.Types.ObjectId, ref: 'Dealer', required: true },
    status: { type: String, enum: ['ACTIVE', 'CANCELLED'], default: 'ACTIVE' },
    items: { type: [soItemSchema], required: true },
    grossAmount: { type: Number, required: true, min: 0 },
    totalCommission: { type: Number, default: 0, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    taxPercent: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    commissionRate: { type: Number, default: 0, min: 0, max: 100 },
    commissionAmount: { type: Number, default: 0, min: 0 },
    notes: { type: String, trim: true },
    deliveryDate: { type: Date },
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

salesOrderSchema.index({ dealer: 1, status: 1 });
salesOrderSchema.index({ orderNumber: 'text' });
salesOrderSchema.index({ createdAt: -1 });

export const SalesOrder = mongoose.model<ISalesOrderDocument>('SalesOrder', salesOrderSchema);
