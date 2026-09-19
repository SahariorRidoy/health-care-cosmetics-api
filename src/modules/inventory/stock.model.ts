import mongoose, { Document, Schema, Types } from 'mongoose';

export type MovementType =
  | 'PURCHASE_RECEIPT'
  | 'PRODUCTION_ISSUE'
  | 'PRODUCTION_OUTPUT'
  | 'SALES_DISPATCH'
  | 'ADJUSTMENT'
  | 'TRANSFER'
  | 'RETURN_SUPPLIER'
  | 'RETURN_CUSTOMER';

export interface IStockMovementDocument extends Document {
  type: MovementType;
  item: Types.ObjectId;
  warehouse: Types.ObjectId;
  quantity: number;       // positive = in, negative = out
  balanceAfter: number;
  reference?: string;     // e.g. PO number, WO number
  referenceModel?: string;
  referenceId?: Types.ObjectId;
  notes?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

const stockMovementSchema = new Schema<IStockMovementDocument>(
  {
    type: {
      type: String,
      required: true,
      enum: ['PURCHASE_RECEIPT', 'PRODUCTION_ISSUE', 'PRODUCTION_OUTPUT', 'SALES_DISPATCH',
             'ADJUSTMENT', 'TRANSFER', 'RETURN_SUPPLIER', 'RETURN_CUSTOMER'],
    },
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    quantity: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    reference: { type: String, trim: true },
    referenceModel: { type: String },
    referenceId: { type: Schema.Types.ObjectId },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

stockMovementSchema.index({ item: 1, warehouse: 1, createdAt: -1 });
stockMovementSchema.index({ type: 1 });
stockMovementSchema.index({ referenceId: 1 });

export const StockMovement = mongoose.model<IStockMovementDocument>('StockMovement', stockMovementSchema);

// ── StockBalance ──────────────────────────────────────────────────────────────

export interface IStockBalanceDocument extends Document {
  item: Types.ObjectId;
  warehouse: Types.ObjectId;
  quantity: number;
  updatedAt: Date;
}

const stockBalanceSchema = new Schema<IStockBalanceDocument>(
  {
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    quantity: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

stockBalanceSchema.index({ item: 1, warehouse: 1 }, { unique: true });

export const StockBalance = mongoose.model<IStockBalanceDocument>('StockBalance', stockBalanceSchema);
