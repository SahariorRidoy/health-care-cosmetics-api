import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IDepartmentDocument extends Document {
  name: string;
  description?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const departmentSchema = new Schema<IDepartmentDocument>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

departmentSchema.index({ name: 1 });

export const Department = mongoose.model<IDepartmentDocument>('Department', departmentSchema);
