import { db } from '../../db/connection.js';
import { invalidateUserCache } from '../../middleware/concurrent-session.js';

export type AuditLogEntry = {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before_json: string | null;
  after_json: string | null;
  ip: string | null;
  severity: string;
  tag: string | null;
  created_at: string;
};

export type AuditLogFilters = {
  page?: number;
  pageSize?: number;
  action?: string;
  entity?: string;
  severity?: string;
  userId?: number;
  dateFrom?: string;
  dateTo?: string;
};

export async function getAuditLog(
  filters: AuditLogFilters = {},
): Promise<{ rows: AuditLogEntry[]; total: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, filters.pageSize ?? 50);

  let query = db('audit_log')
    .leftJoin('users', 'audit_log.user_id', 'users.id')
    .select(
      'audit_log.id',
      'audit_log.user_id',
      'users.username',
      'audit_log.action',
      'audit_log.entity',
      'audit_log.entity_id',
      'audit_log.before_json',
      'audit_log.after_json',
      'audit_log.ip',
      'audit_log.severity',
      'audit_log.tag',
      'audit_log.created_at',
    )
    .orderBy('audit_log.created_at', 'desc');

  if (filters.action) query = query.where('audit_log.action', filters.action);
  if (filters.entity) query = query.where('audit_log.entity', filters.entity);
  if (filters.severity) query = query.where('audit_log.severity', filters.severity);
  if (filters.userId) query = query.where('audit_log.user_id', filters.userId);
  if (filters.dateFrom) query = query.where('audit_log.created_at', '>=', filters.dateFrom);
  if (filters.dateTo) query = query.where('audit_log.created_at', '<=', filters.dateTo);

  const countQuery = query.clone().clearSelect().clearOrder().count('audit_log.id as count');
  const [{ count }] = await countQuery as unknown as [{ count: string }];

  const rows = await query.offset((page - 1) * pageSize).limit(pageSize) as unknown as AuditLogEntry[];

  return { rows, total: Number(count) };
}

export async function forceSignout(userId: number): Promise<void> {
  await db('users').where({ id: userId }).update({ sign_out_after: db.fn.now() });
  await db('sessions').where({ user_id: userId }).whereNull('revoked_at').update({ revoked_at: db.fn.now() });
  invalidateUserCache(userId);
}

export async function forceSignoutRole(role: string): Promise<void> {
  const users = await db('users').where({ role }).select('id');
  if (users.length === 0) return;
  const userIds = users.map((u: { id: number }) => u.id);
  await db('users').whereIn('id', userIds).update({ sign_out_after: db.fn.now() });
  await db('sessions').whereIn('user_id', userIds).whereNull('revoked_at').update({ revoked_at: db.fn.now() });
  for (const id of userIds) invalidateUserCache(id);
}

export async function setForcePasswordChange(userId: number, value: boolean): Promise<void> {
  await db('users').where({ id: userId }).update({
    force_password_change: value,
    permissions_revision: db.raw('permissions_revision + 1'),
  });
  invalidateUserCache(userId);
}

export async function getUserSessions(userId: number) {
  return db('sessions')
    .where({ user_id: userId })
    .whereNull('revoked_at')
    .select('id', 'jwt_jti', 'device_info', 'ip', 'created_at', 'last_seen_at')
    .orderBy('created_at', 'desc');
}

export async function revokeUserSessions(userId: number): Promise<void> {
  await db('sessions').where({ user_id: userId }).whereNull('revoked_at').update({ revoked_at: db.fn.now() });
  await forceSignout(userId);
}
