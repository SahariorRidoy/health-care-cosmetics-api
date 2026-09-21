import mongoose, { Document, Schema, Types } from 'mongoose';

export type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'TERMINATED';

export interface IEmployeeDocument extends Document {
  employeeId: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  department: Types.ObjectId;
  designation: string;
  joiningDate: Date;
  status: EmployeeStatus;
  currentSalary: number;
  cvPath?: string;
  nidPath?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const employeeSchema = new Schema<IEmployeeDocument>(
  {
    employeeId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
    designation: { type: String, required: true, trim: true },
    joiningDate: { type: Date, required: true },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'TERMINATED'], default: 'ACTIVE' },
    currentSalary: { type: Number, default: 0, min: 0 },
    cvPath: { type: String },
    nidPath: { type: String },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

employeeSchema.index({ name: 'text', employeeId: 'text', designation: 'text' });
employeeSchema.index({ department: 1, status: 1 });

export const Employee = mongoose.model<IEmployeeDocument>('Employee', employeeSchema);
