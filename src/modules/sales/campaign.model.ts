import mongoose, { Document, Schema, Types } from 'mongoose';

export type CampaignTargetMode = 'NONE' | 'TOTAL' | 'MONTHLY';

export interface ICampaignMonthlyTarget {
  month: string; // YYYY-MM (Asia/Dhaka)
  target: number;
}

export interface ICampaignDocument extends Document {
  name: string;
  startDate: Date;
  endDate: Date;
  durationMonths?: number; // preset used; undefined = custom
  territories: Types.ObjectId[];
  prize: string;
  notes?: string;
  targetMode: CampaignTargetMode;
  totalTarget: number;                 // ৳ net sales for whole campaign
  monthlyTargets: ICampaignMonthlyTarget[];
  dealerTarget: number;                // optional ৳ target per dealer for whole campaign
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const campaignSchema = new Schema<ICampaignDocument>(
  {
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    durationMonths: { type: Number, min: 1, max: 24 },
    territories: [{ type: Schema.Types.ObjectId, ref: 'Territory' }],
    prize: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },
    targetMode: { type: String, enum: ['NONE', 'TOTAL', 'MONTHLY'], default: 'NONE' },
    totalTarget: { type: Number, default: 0, min: 0 },
    monthlyTargets: [{
      month: { type: String, required: true },
      target: { type: Number, required: true, min: 0 },
      _id: false,
    }],
    dealerTarget: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

campaignSchema.index({ name: 'text' });
campaignSchema.index({ isActive: 1 });
campaignSchema.index({ startDate: 1, endDate: 1 });

export const Campaign = mongoose.model<ICampaignDocument>('Campaign', campaignSchema);
