import mongoose, { Document, Schema, Types } from 'mongoose';

export type SalesOrderStatus = 'DRAFT' | 'CONFIRMED' | 'DISPATCHED' | 'CLOSED' | 'CANCELLED';

export interface ISalesOrderItem {
  item: Types.ObjectId;
  description?: string;
  qty: number;
  unitPrice: number;
  discount: number;       // percentage 0–100
  lineTotal: number;      // server-calculated: qty * unitPrice * (1 - discount/100)
  uom: Types.ObjectId;
}

export interface ISalesOrderDocument extends Document {
  orderNumber: string;
  customer: Types.ObjectId;
  status: SalesOrderStatus;
  items: ISalesOrderItem[];
  subtotal: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  totalAmount: number;
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
    unitPrice: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0, max: 100 },
    lineTotal: { type: Number, required: true, min: 0 },
    uom: { type: Schema.Types.ObjectId, ref: 'UOM', required: true },
  },
  { _id: false },
);

const salesOrderSchema = new Schema<ISalesOrderDocument>(
  {
    orderNumber: { type: String, required: true, unique: true, trim: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'CONFIRMED', 'DISPATCHED', 'CLOSED', 'CANCELLED'],
      default: 'CONFIRMED',
    },
    items: { type: [soItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxPercent: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true },
    deliveryDate: { type: Date },
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

salesOrderSchema.index({ customer: 1, status: 1 });
salesOrderSchema.index({ orderNumber: 'text' });
salesOrderSchema.index({ createdAt: -1 });

export const SalesOrder = mongoose.model<ISalesOrderDocument>('SalesOrder', salesOrderSchema);
