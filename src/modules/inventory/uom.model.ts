import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IUOMDocument extends Document {
  name: string;
  symbol: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const uomSchema = new Schema<IUOMDocument>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    symbol: { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

uomSchema.index({ name: 'text', symbol: 'text' });

export const UOM = mongoose.model<IUOMDocument>('UOM', uomSchema);

// ── UOM Conversion ────────────────────────────────────────────────────────────

export interface IUOMConversionDocument extends Document {
  fromUOM: Types.ObjectId;
  toUOM: Types.ObjectId;
  factor: number;          // multiply fromUOM qty by factor to get toUOM qty
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const uomConversionSchema = new Schema<IUOMConversionDocument>(
  {
    fromUOM: { type: Schema.Types.ObjectId, ref: 'UOM', required: true },
    toUOM: { type: Schema.Types.ObjectId, ref: 'UOM', required: true },
    factor: { type: Number, required: true, min: 0.000001 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

uomConversionSchema.index({ fromUOM: 1, toUOM: 1 }, { unique: true });
uomConversionSchema.index({ isActive: 1 });

export const UOMConversion = mongoose.model<IUOMConversionDocument>('UOMConversion', uomConversionSchema);
