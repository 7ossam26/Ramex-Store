import { db } from '../../db/connection.js';

type Severity = 'low' | 'medium' | 'high' | 'critical';

export type ServiceAuditEntry = {
  actorUserId: number;
  action: string;
  entity: string;
  entityId: string | number | null;
  before?: unknown;
  after?: unknown;
  severity?: Severity;
  tag?: string | null;
};

/**
 * Service-level audit insert. Use this from inside services that emit
 * cascading audit entries (e.g. roll status flip during shipment finalize).
 * Top-level user-action audit should still go through middleware/audit.ts
 * from the controller.
 */
export async function auditFromService(
  trx: typeof db | import('knex').Knex.Transaction,
  e: ServiceAuditEntry,
): Promise<void> {
  await trx('audit_log').insert({
    user_id: e.actorUserId,
    action: e.action,
    entity: e.entity,
    entity_id: e.entityId == null ? null : String(e.entityId),
    before_json: e.before == null ? null : JSON.stringify(e.before),
    after_json: e.after == null ? null : JSON.stringify(e.after),
    ip: null,
    user_agent: null,
    severity: e.severity ?? 'low',
    tag: e.tag ?? null,
  });
}
