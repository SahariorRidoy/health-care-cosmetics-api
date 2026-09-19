import mongoose, { Document, Schema, Types } from 'mongoose';

export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';

export interface IInvoiceItem {
  item: Types.ObjectId;
  description?: string;
  qty: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
  uom: Types.ObjectId;
}

export interface IInvoiceDocument extends Document {
  invoiceNumber: string;
  salesOrder?: Types.ObjectId;
  customer: Types.ObjectId;
  status: InvoiceStatus;
  items: IInvoiceItem[];
  subtotal: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  dueDate?: Date;
  notes?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const invoiceItemSchema = new Schema<IInvoiceItem>(
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

const invoiceSchema = new Schema<IInvoiceDocument>(
  {
    invoiceNumber: { type: String, required: true, unique: true, trim: true },
    salesOrder: { type: Schema.Types.ObjectId, ref: 'SalesOrder' },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    status: {
      type: String,
      enum: ['UNPAID', 'PARTIAL', 'PAID', 'CANCELLED'],
      default: 'UNPAID',
    },
    items: { type: [invoiceItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    taxPercent: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    dueAmount: { type: Number, required: true, min: 0 },
    dueDate: { type: Date },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

invoiceSchema.index({ customer: 1, status: 1 });
invoiceSchema.index({ salesOrder: 1 });
invoiceSchema.index({ invoiceNumber: 'text' });
invoiceSchema.index({ createdAt: -1 });

export const Invoice = mongoose.model<IInvoiceDocument>('Invoice', invoiceSchema);
