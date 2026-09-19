import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IGRItem {
  item: Types.ObjectId;
  orderedQty: number;
  receivedQty: number;
  unitPrice: number;
  totalPrice: number;
  uom: Types.ObjectId;
  batchNumber?: string;
  expiryDate?: Date;
}

export interface IGoodsReceiptDocument extends Document {
  grNumber: string;
  purchaseOrder: Types.ObjectId;
  supplier: Types.ObjectId;
  warehouse: Types.ObjectId;
  items: IGRItem[];
  totalAmount: number;
  notes?: string;
  receivedDate: Date;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const grItemSchema = new Schema<IGRItem>(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    orderedQty: { type: Number, required: true, min: 0 },
    receivedQty: { type: Number, required: true, min: 0.001 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    uom: { type: Schema.Types.ObjectId, ref: 'UOM', required: true },
    batchNumber: { type: String, trim: true, uppercase: true },
    expiryDate: { type: Date },
  },
  { _id: false },
);

const goodsReceiptSchema = new Schema<IGoodsReceiptDocument>(
  {
    grNumber: { type: String, required: true, unique: true, trim: true },
    purchaseOrder: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    items: { type: [grItemSchema], required: true },
    totalAmount: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true },
    receivedDate: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

goodsReceiptSchema.index({ purchaseOrder: 1 });
goodsReceiptSchema.index({ supplier: 1 });
goodsReceiptSchema.index({ createdAt: -1 });

export const GoodsReceipt = mongoose.model<IGoodsReceiptDocument>('GoodsReceipt', goodsReceiptSchema);
