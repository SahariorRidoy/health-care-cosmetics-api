import mongoose, { Document, Schema, Types } from 'mongoose';

export type ProductionStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';

export interface IMaterialLine {
  item: Types.ObjectId;
  uom: Types.ObjectId;
  plannedQty: number;
  issuedQty: number;
  actualConsumedQty: number;
}

export interface IProductionOrderDocument extends Document {
  woNumber: string;
  bom: Types.ObjectId;
  product: Types.ObjectId;
  warehouse: Types.ObjectId;
  plannedQty: number;
  actualOutputQty: number;
  wastageQty: number;
  totalMaterialCost: number;  // calculated on completion
  costPerUnit: number;        // totalMaterialCost / actualOutputQty
  status: ProductionStatus;
  materials: IMaterialLine[];
  startDate?: Date;
  completedDate?: Date;
  notes?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const materialLineSchema = new Schema<IMaterialLine>(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    uom: { type: Schema.Types.ObjectId, ref: 'UOM', required: true },
    plannedQty: { type: Number, required: true, min: 0 },
    issuedQty: { type: Number, default: 0, min: 0 },
    actualConsumedQty: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const productionOrderSchema = new Schema<IProductionOrderDocument>(
  {
    woNumber: { type: String, required: true, unique: true, trim: true },
    bom: { type: Schema.Types.ObjectId, ref: 'BOM', required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    plannedQty: { type: Number, required: true, min: 0.001 },
    actualOutputQty: { type: Number, default: 0, min: 0 },
    wastageQty: { type: Number, default: 0, min: 0 },
    totalMaterialCost: { type: Number, default: 0, min: 0 },
    costPerUnit: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'],
      default: 'DRAFT',
    },
    materials: { type: [materialLineSchema], default: [] },
    startDate: { type: Date },
    completedDate: { type: Date },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

productionOrderSchema.index({ status: 1 });
productionOrderSchema.index({ product: 1 });
productionOrderSchema.index({ createdAt: -1 });

export const ProductionOrder = mongoose.model<IProductionOrderDocument>('ProductionOrder', productionOrderSchema);
