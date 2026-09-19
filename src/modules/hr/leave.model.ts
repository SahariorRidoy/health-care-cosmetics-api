import mongoose, { Document, Schema, Types } from 'mongoose';

export type LeaveType = 'ANNUAL' | 'SICK' | 'CASUAL' | 'UNPAID' | 'OTHER';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface ILeaveDocument extends Document {
  employee: Types.ObjectId;
  leaveType: LeaveType;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  reason: string;
  status: LeaveStatus;
  notes?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const leaveSchema = new Schema<ILeaveDocument>(
  {
    employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    leaveType: { type: String, enum: ['ANNUAL', 'SICK', 'CASUAL', 'UNPAID', 'OTHER'], required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    totalDays: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true, trim: true },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'], default: 'PENDING' },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  },
  { timestamps: true },
);

leaveSchema.index({ employee: 1, status: 1 });
leaveSchema.index({ startDate: -1 });

export const Leave = mongoose.model<ILeaveDocument>('Leave', leaveSchema);
