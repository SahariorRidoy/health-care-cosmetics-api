import mongoose, { Document, Schema, Types } from 'mongoose';

export type FactoryOrderStatus =
  | 'DRAFT'
  | 'DISPATCHED'
  | 'IN_PRODUCTION'
  | 'PARTIALLY_RECEIVED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface IFactoryMaterialLine {
  item: Types.ObjectId;
  qty: number;
  uom: Types.ObjectId;
  dispatchedQty: number;
}

export interface IFactoryExpectedProduct {
  name: string;
  expectedQty: number;
  uom: Types.ObjectId;
  receivedQty: number;
  linkedItem?: Types.ObjectId;
}

export interface IFactoryOrderDocument extends Document {
  foNumber: string;
  orderName: string;
  warehouse: Types.ObjectId;
  status: FactoryOrderStatus;
  materials: IFactoryMaterialLine[];
  expectedProducts: IFactoryExpectedProduct[];
  serviceCharge: number;
  totalMaterialCost: number;
  totalCost: number;
  expectedDeliveryDate?: Date;
  dispatchedDate?: Date;
  notes?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const factoryMaterialLineSchema = new Schema<IFactoryMaterialLine>(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    qty: { type: Number, required: true, min: 0.001 },
    uom: { type: Schema.Types.ObjectId, ref: 'UOM', required: true },
    dispatchedQty: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const factoryExpectedProductSchema = new Schema<IFactoryExpectedProduct>(
  {
    name: { type: String, required: true, trim: true },
    expectedQty: { type: Number, required: true, min: 0.001 },
    uom: { type: Schema.Types.ObjectId, ref: 'UOM', required: true },
    receivedQty: { type: Number, default: 0, min: 0 },
    linkedItem: { type: Schema.Types.ObjectId, ref: 'Item' },
  },
  { _id: false },
);

const factoryOrderSchema = new Schema<IFactoryOrderDocument>(
  {
    foNumber: { type: String, required: true, unique: true, trim: true },
    orderName: { type: String, required: true, trim: true },
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'DISPATCHED', 'IN_PRODUCTION', 'PARTIALLY_RECEIVED', 'COMPLETED', 'CANCELLED'],
      default: 'DRAFT',
    },
    materials: { type: [factoryMaterialLineSchema], required: true },
    expectedProducts: { type: [factoryExpectedProductSchema], required: true },
    serviceCharge: { type: Number, default: 0, min: 0 },
    totalMaterialCost: { type: Number, default: 0, min: 0 },
    totalCost: { type: Number, default: 0, min: 0 },
    expectedDeliveryDate: { type: Date },
    dispatchedDate: { type: Date },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

factoryOrderSchema.index({ status: 1 });
factoryOrderSchema.index({ createdAt: -1 });

export const FactoryOrder = mongoose.model<IFactoryOrderDocument>('FactoryOrder', factoryOrderSchema);
