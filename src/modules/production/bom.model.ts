import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IBOMInput {
  item: Types.ObjectId;
  qty: number;
  uom: Types.ObjectId;
}

export interface IBOMDocument extends Document {
  product: Types.ObjectId;
  version: string;
  inputMaterials: IBOMInput[];
  expectedOutputQty: number;
  outputUom: Types.ObjectId;
  wastagePercent: number;
  notes?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const bomInputSchema = new Schema<IBOMInput>(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    qty: { type: Number, required: true, min: 0.001 },
    uom: { type: Schema.Types.ObjectId, ref: 'UOM', required: true },
  },
  { _id: false },
);

const bomSchema = new Schema<IBOMDocument>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    version: { type: String, required: true, trim: true, default: 'v1' },
    inputMaterials: { type: [bomInputSchema], required: true },
    expectedOutputQty: { type: Number, required: true, min: 0.001 },
    outputUom: { type: Schema.Types.ObjectId, ref: 'UOM', required: true },
    wastagePercent: { type: Number, default: 0, min: 0, max: 100 },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

bomSchema.index({ product: 1, version: 1 }, { unique: true });
bomSchema.index({ isActive: 1 });

export const BOM = mongoose.model<IBOMDocument>('BOM', bomSchema);
