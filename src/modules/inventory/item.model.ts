import mongoose, { Document, Schema, Types } from 'mongoose';

export type ItemType = 'RAW_MATERIAL' | 'PACKAGING' | 'SEMI_FINISHED' | 'FINISHED_GOOD';

export interface IItemMaterial {
  item: Types.ObjectId;
  qty: number;
  uom: Types.ObjectId;
}

export interface IItemDocument extends Document {
  name: string;
  sku: string;
  type: ItemType;
  description?: string;
  baseUom: Types.ObjectId;
  supplier?: Types.ObjectId;
  currentStock: number;
  reorderLevel: number;
  costPrice: number;
  lastPurchasePrice: number;
  salePrice?: number;
  materials: IItemMaterial[];
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
    description: { type: String, trim: true },
    baseUom: { type: Schema.Types.ObjectId, ref: 'UOM', required: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    currentStock: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0, min: 0 },
    costPrice: { type: Number, default: 0, min: 0 },
    lastPurchasePrice: { type: Number, default: 0, min: 0 },
    salePrice: { type: Number, min: 0 },
    materials: [
      {
        item: { type: Schema.Types.ObjectId, ref: 'Item' },
        qty: { type: Number },
        uom: { type: Schema.Types.ObjectId, ref: 'UOM' },
        _id: false,
      },
    ],
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

itemSchema.index({ name: 'text', sku: 'text' });
itemSchema.index({ type: 1, isActive: 1 });
itemSchema.index({ supplier: 1 });

export const Item = mongoose.model<IItemDocument>('Item', itemSchema);
