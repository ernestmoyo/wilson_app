import db from '../db/database';

/**
 * Log an action to the audit_log table.
 * Never throws — logs to console.error on failure so main operations aren't blocked.
 */
export function logAudit(
  entityType: string,
  entityId: number | bigint,
  action: string,
  details?: Record<string, unknown>,
  userId?: number
): void {
  try {
    db.prepare(
      'INSERT INTO audit_log (entity_type, entity_id, action, user_id, details) VALUES (?, ?, ?, ?, ?)'
    ).run(entityType, entityId, action, userId ?? null, details ? JSON.stringify(details) : null);
  } catch (err) {
    console.error(`[AUDIT FAIL] ${entityType}:${entityId} ${action}:`, err);
  }
}
