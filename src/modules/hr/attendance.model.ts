import mongoose, { Document, Schema, Types } from 'mongoose';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY';

export interface IAttendanceDocument extends Document {
  employee: Types.ObjectId;
  date: Date;
  status: AttendanceStatus;
  notes?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceSchema = new Schema<IAttendanceDocument>(
  {
    employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY'], required: true },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

// One record per employee per day
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: -1 });

export const Attendance = mongoose.model<IAttendanceDocument>('Attendance', attendanceSchema);
