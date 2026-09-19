import mongoose, { Document, Schema } from 'mongoose';

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
