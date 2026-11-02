import mongoose, { Document, Schema } from 'mongoose';

export interface ITerritoryDocument extends Document {
  name: string;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const territorySchema = new Schema<ITerritoryDocument>(
  {
    name: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

territorySchema.index({ name: 'text' });
territorySchema.index({ isActive: 1 });

export const Territory = mongoose.model<ITerritoryDocument>('Territory', territorySchema);
