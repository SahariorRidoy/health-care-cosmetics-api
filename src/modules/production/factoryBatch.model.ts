import mongoose, { Document, Schema, Types } from 'mongoose';

export type FactoryBatchStatus =
  | 'DRAFT'
  | 'DISPATCHED'
  | 'IN_PRODUCTION'
  | 'PARTIALLY_RECEIVED'
  | 'COMPLETED'
  | 'CANCELLED';

// ── Sub-document interfaces ───────────────────────────────────────────────────

export interface IDispatchMaterial {
  item: Types.ObjectId;
  qty: number;
  uom: Types.ObjectId;
  dispatchedQty: number;
  unitCost: number; // item.costPrice at time of dispatch
}

export interface IReceiptMaterialUsed {
  item: Types.ObjectId;
  usedQty: number;
  uom: Types.ObjectId;
}

export interface IReceiptProduct {
  productName: string;
  linkedItem?: Types.ObjectId;
  isNewProduct: boolean;
  newProductData?: {
    name: string;
    sku?: string;
    baseUom: Types.ObjectId;
    salePrice?: number;
    reorderLevel?: number;
  };
  receivedQty: number;
  uom: Types.ObjectId;
  materialsUsed: IReceiptMaterialUsed[];
  materialCost: number;        // server-calculated
  allocatedSharedCost: number; // server-calculated
  totalUnitCost: number;       // server-calculated
  salePrice?: number;
}

export interface IFactoryReceipt {
  _id: Types.ObjectId;
  receiptNumber: string;
  receiptDate: Date;
  deliveryCost: number;
  productionCost: number;
  otherCost: number;
  costAllocationMethod: 'PER_UNIT';
  products: IReceiptProduct[];
  createdBy: Types.ObjectId;
  createdAt: Date;
}

export interface IFactoryMaterialReturn {
  _id: Types.ObjectId;
  returnDate: Date;
  materials: { item: Types.ObjectId; returnedQty: number; uom: Types.ObjectId }[];
  notes?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

export interface IFactoryBatchDocument extends Document {
  fbNumber: string;
  batchName: string;
  warehouse: Types.ObjectId;
  status: FactoryBatchStatus;
  dispatch: {
    materials: IDispatchMaterial[];
    dispatchedDate?: Date;
    notes?: string;
  };
  receipts: IFactoryReceipt[];
  materialReturns: IFactoryMaterialReturn[];
  expectedDeliveryDate?: Date;
  notes?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const dispatchMaterialSchema = new Schema<IDispatchMaterial>(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    qty: { type: Number, required: true, min: 0.001 },
    uom: { type: Schema.Types.ObjectId, ref: 'UOM', required: true },
    dispatchedQty: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const receiptMaterialUsedSchema = new Schema<IReceiptMaterialUsed>(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    usedQty: { type: Number, required: true, min: 0.001 },
    uom: { type: Schema.Types.ObjectId, ref: 'UOM', required: true },
  },
  { _id: false },
);

const receiptProductSchema = new Schema<IReceiptProduct>(
  {
    productName: { type: String, required: true, trim: true },
    linkedItem: { type: Schema.Types.ObjectId, ref: 'Item' },
    isNewProduct: { type: Boolean, required: true },
    newProductData: {
      name: { type: String, trim: true },
      sku: { type: String, trim: true },
      baseUom: { type: Schema.Types.ObjectId, ref: 'UOM' },
      salePrice: { type: Number, min: 0 },
      reorderLevel: { type: Number, min: 0, default: 0 },
    },
    receivedQty: { type: Number, required: true, min: 0.001 },
    uom: { type: Schema.Types.ObjectId, ref: 'UOM', required: true },
    materialsUsed: { type: [receiptMaterialUsedSchema], default: [] },
    materialCost: { type: Number, default: 0, min: 0 },
    allocatedSharedCost: { type: Number, default: 0, min: 0 },
    totalUnitCost: { type: Number, default: 0, min: 0 },
    salePrice: { type: Number, min: 0 },
  },
  { _id: false },
);

const factoryReceiptSchema = new Schema<IFactoryReceipt>(
  {
    receiptNumber: { type: String, required: true, trim: true },
    receiptDate: { type: Date, required: true },
    deliveryCost: { type: Number, default: 0, min: 0 },
    productionCost: { type: Number, default: 0, min: 0 },
    otherCost: { type: Number, default: 0, min: 0 },
    costAllocationMethod: { type: String, enum: ['PER_UNIT'], default: 'PER_UNIT' },
    products: { type: [receiptProductSchema], required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const materialReturnSchema = new Schema<IFactoryMaterialReturn>(
  {
    returnDate: { type: Date, required: true },
    materials: [
      {
        item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
        returnedQty: { type: Number, required: true, min: 0.001 },
        uom: { type: Schema.Types.ObjectId, ref: 'UOM', required: true },
        _id: false,
      },
    ],
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

// ── Main schema ───────────────────────────────────────────────────────────────

const factoryBatchSchema = new Schema<IFactoryBatchDocument>(
  {
    fbNumber: { type: String, required: true, unique: true, trim: true },
    batchName: { type: String, required: true, trim: true },
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    status: {
      type: String,
      enum: ['DRAFT', 'DISPATCHED', 'IN_PRODUCTION', 'PARTIALLY_RECEIVED', 'COMPLETED', 'CANCELLED'],
      default: 'DRAFT',
    },
    dispatch: {
      materials: { type: [dispatchMaterialSchema], default: [] },
      dispatchedDate: { type: Date },
      notes: { type: String, trim: true },
    },
    receipts: { type: [factoryReceiptSchema], default: [] },
    materialReturns: { type: [materialReturnSchema], default: [] },
    expectedDeliveryDate: { type: Date },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

factoryBatchSchema.index({ status: 1 });
factoryBatchSchema.index({ createdAt: -1 });
factoryBatchSchema.index({ fbNumber: 1 }, { unique: true });

export const FactoryBatch = mongoose.model<IFactoryBatchDocument>('FactoryBatch', factoryBatchSchema);
