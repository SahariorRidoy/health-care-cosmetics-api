import mongoose, { Document, Schema, Types } from 'mongoose';

export type ItemType = 'RAW_MATERIAL' | 'PACKAGING' | 'SEMI_FINISHED' | 'FINISHED_GOOD';

export interface IItemDocument extends Document {
  name: string;
  sku: string;
  type: ItemType;
  category: string;
  description?: string;
  baseUom: Types.ObjectId;
  reorderLevel: number;
  currentStock: number;
  costPrice: number;
  salePrice?: number;
  isActive: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const itemSchema = new Schema<IItemDocument>(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true, unique: true, uppercase: true },
    type: {
      type: String,
      required: true,
      enum: ['RAW_MATERIAL', 'PACKAGING', 'SEMI_FINISHED', 'FINISHED_GOOD'],
    },
    category: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    baseUom: { type: Schema.Types.ObjectId, ref: 'UOM', required: true },
    reorderLevel: { type: Number, default: 0, min: 0 },
    currentStock: { type: Number, default: 0 },
    costPrice: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, min: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

itemSchema.index({ name: 'text', sku: 'text', category: 'text' });
itemSchema.index({ type: 1, isActive: 1 });
itemSchema.index({ currentStock: 1 });

export const Item = mongoose.model<IItemDocument>('Item', itemSchema);
