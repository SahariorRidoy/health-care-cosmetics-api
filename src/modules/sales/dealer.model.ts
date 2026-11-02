import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IDealerFlatPrice {
  item: Types.ObjectId;
  price: number;
}

export interface IDealerDocument extends Document {
  name: string;
  proprietor?: string;
  phone?: string;
  email?: string;
  address?: string;       // shown as "Location" in the UI
  territory?: Types.ObjectId;
  rsmName?: string;
  courierName?: string;
  campaigns: Types.ObjectId[];
  flatPrices: IDealerFlatPrice[];
  commissionRate: number; // default commission % 0–25
  balance: number;        // outstanding receivable (positive = they owe us)
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const flatPriceSchema = new Schema<IDealerFlatPrice>(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const dealerSchema = new Schema<IDealerDocument>(
  {
    name: { type: String, required: true, trim: true },
    proprietor: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
    territory: { type: Schema.Types.ObjectId, ref: 'Territory' },
    rsmName: { type: String, trim: true },
    courierName: { type: String, trim: true },
    campaigns: [{ type: Schema.Types.ObjectId, ref: 'Campaign' }],
    flatPrices: { type: [flatPriceSchema], default: [] },
    commissionRate: { type: Number, default: 0, min: 0, max: 25 },
    balance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

dealerSchema.index({ name: 'text' });
dealerSchema.index({ isActive: 1 });
dealerSchema.index({ territory: 1 });
dealerSchema.index({ campaigns: 1 });

export const Dealer = mongoose.model<IDealerDocument>('Dealer', dealerSchema);
