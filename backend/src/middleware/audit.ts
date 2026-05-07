import type { Request } from 'express';
import { db } from '../db/connection.js';

export type AuditOpts = {
  severity?: 'low' | 'medium' | 'high' | 'critical';
  tag?: string;
  userId?: number | null;
};

export async function auditLog(
  req: Request,
  action: string,
  entity: string,
  entityId: string | number | null,
  before: unknown,
  after: unknown,
  opts: AuditOpts = {},
): Promise<void> {
  await db('audit_log').insert({
    user_id: opts.userId ?? req.user?.sub ?? null,
    action,
    entity,
    entity_id: entityId == null ? null : String(entityId),
    before_json: before == null ? null : JSON.stringify(before),
    after_json: after == null ? null : JSON.stringify(after),
    ip: req.ip ?? null,
    user_agent: req.headers['user-agent']?.slice(0, 255) ?? null,
    severity: opts.severity ?? 'low',
    tag: opts.tag ?? null,
  });
}
