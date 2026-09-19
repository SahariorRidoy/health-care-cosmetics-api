import { AuditLog } from './audit.model';

interface LogParams {
  action: string;
  entity: string;
  entityId?: string;
  userId?: string;
  userName?: string;
  changes?: Record<string, unknown>;
  ip?: string;
}

export async function logAudit(params: LogParams): Promise<void> {
  try {
    await AuditLog.create(params);
  } catch (err) {
    // Audit log failure must never break the main operation
    console.error('Audit log error:', err);
  }
}
