import mongoose, { Document, Schema } from 'mongoose';

export interface IWarehouseDocument extends Document {
  name: string;
  code: string;
  address?: string;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const warehouseSchema = new Schema<IWarehouseDocument>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, required: true, trim: true, unique: true, uppercase: true },
    address: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Warehouse = mongoose.model<IWarehouseDocument>('Warehouse', warehouseSchema);
