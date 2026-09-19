import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IBatchDocument extends Document {
  batchNumber: string;
  item: Types.ObjectId;
  warehouse: Types.ObjectId;
  quantity: number;
  expiryDate?: Date;
  manufacturedDate?: Date;
  notes?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const batchSchema = new Schema<IBatchDocument>(
  {
    batchNumber: { type: String, required: true, trim: true, uppercase: true },
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    quantity: { type: Number, required: true, min: 0 },
    expiryDate: { type: Date },
    manufacturedDate: { type: Date },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

batchSchema.index({ batchNumber: 1, item: 1, warehouse: 1 }, { unique: true });
batchSchema.index({ item: 1, warehouse: 1 });
batchSchema.index({ expiryDate: 1 });

export const Batch = mongoose.model<IBatchDocument>('Batch', batchSchema);
