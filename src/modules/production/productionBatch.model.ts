
import mongoose, { Document, Schema, Types } from 'mongoose';

// Interface for the materials used in this specific batch
export interface IBatchMaterial {
  item: Types.ObjectId; // Reference to the raw material Item
  itemName: string; // Denormalized for historical accuracy
  qtyUsed: number;
  costAtTime: number; // Cost of the material at the time of production
  uom?: Types.ObjectId;
  uomSymbol?: string;
  baseUomSymbol?: string;
  baseQtyUsed?: number;
  lineCost?: number;
}

export interface IProductionBatchDocument extends Document {
  batchNumber: string;
  product: Types.ObjectId; // Reference to the FINISHED_GOOD Item
  productName?: string;
  productSku?: string;
  productionOrder?: Types.ObjectId; // Absent for direct production runs
  warehouse?: Types.ObjectId;
  outputUom?: Types.ObjectId;
  outputUomSymbol?: string;
  manufacturedDate: Date;
  quantityProduced: number;
  costOfMaterials: number; // Total cost of all materials for this batch
  totalProductionCost: number; // Includes materials, labor, overhead etc. (can be expanded later)
  costPerUnit: number; // totalProductionCost / quantityProduced
  materialsUsed: IBatchMaterial[];
  notes?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const productionBatchSchema = new Schema<IProductionBatchDocument>(
  {
    batchNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    product: { type: Schema.Types.ObjectId, ref: 'Item', required: true, index: true },
    productName: { type: String, trim: true },
    productSku: { type: String, trim: true, uppercase: true },
    productionOrder: { type: Schema.Types.ObjectId, ref: 'ProductionOrder', index: true },
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse' },
    outputUom: { type: Schema.Types.ObjectId, ref: 'UOM' },
    outputUomSymbol: { type: String, trim: true },
    manufacturedDate: { type: Date, default: Date.now, required: true },
    quantityProduced: { type: Number, required: true, min: 0 },
    costOfMaterials: { type: Number, required: true, min: 0 },
    totalProductionCost: { type: Number, required: true, min: 0 },
    costPerUnit: { type: Number, required: true, min: 0 },
    materialsUsed: [
      {
        item: { type: Schema.Types.ObjectId, ref: 'Item' },
        itemName: { type: String },
        qtyUsed: { type: Number },
        costAtTime: { type: Number },
        uom: { type: Schema.Types.ObjectId, ref: 'UOM' },
        uomSymbol: { type: String, trim: true },
        baseUomSymbol: { type: String, trim: true },
        baseQtyUsed: { type: Number },
        lineCost: { type: Number },
        _id: false,
      },
    ],
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export const ProductionBatch = mongoose.model<IProductionBatchDocument>('ProductionBatch', productionBatchSchema);
