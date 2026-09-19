import mongoose, { Document, Schema } from 'mongoose';

export interface IAuditLogDocument extends Document {
  action: string;
  entity: string;
  entityId?: string;
  userId?: string;
  userName?: string;
  changes?: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLogDocument>(
  {
    action: { type: String, required: true },   // e.g. 'CREATE', 'UPDATE', 'DELETE', 'LOGIN'
    entity: { type: String, required: true },   // e.g. 'User', 'Item', 'PurchaseOrder'
    entityId: { type: String },
    userId: { type: String },
    userName: { type: String },
    changes: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: true },
);

// Index for querying by entity and user
auditLogSchema.index({ entity: 1, entityId: 1 });
auditLogSchema.index({ userId: 1 });
auditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLogDocument>('AuditLog', auditLogSchema);
