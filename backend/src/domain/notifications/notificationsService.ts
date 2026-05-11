import { db } from '../../db/connection.js';
import { logger } from '../../lib/logger.js';
import { dispatch } from './approvalDispatcher.js';

export type NotifySeverity = 'low' | 'medium' | 'high' | 'critical';
export type NotifyRecipient =
  | { recipientUserId: number; recipientRole?: never }
  | { recipientRole: 'owner' | 'shop_seller' | 'factory_sender'; recipientUserId?: never };

export type NotifyInput = {
  severity: NotifySeverity;
  eventType: string;
  titleAr: string;
  bodyAr: string;
  tag?: string | null;
  payload?: Record<string, unknown> | null;
  isBlocking?: boolean;
  blockedActionPayload?: Record<string, unknown> | null;
} & NotifyRecipient;

export type NotificationRow = {
  id: number;
  recipient_user_id: number | null;
  recipient_role: string | null;
  event_type: string;
  severity: string;
  tag: string | null;
  title_ar: string;
  body_ar: string;
  payload_jsonb: Record<string, unknown> | null;
  is_blocking: boolean;
  blocked_action_payload_jsonb: Record<string, unknown> | null;
  read_at: string | null;
  archived_at: string | null;
  resolved_at: string | null;
  resolved_by_user_id: number | null;
  resolution: string | null;
  created_at: string;
};

export async function notify(input: NotifyInput): Promise<NotificationRow> {
  const row = {
    recipient_user_id: input.recipientUserId ?? null,
    recipient_role: input.recipientRole ?? null,
    event_type: input.eventType,
    severity: input.severity,
    tag: input.tag ?? null,
    title_ar: input.titleAr,
    body_ar: input.bodyAr,
    payload_jsonb: input.payload ? JSON.stringify(input.payload) : null,
    is_blocking: input.isBlocking ?? false,
    blocked_action_payload_jsonb: input.blockedActionPayload ? JSON.stringify(input.blockedActionPayload) : null,
  };

  const [id] = await db('notifications').insert(row);
  const inserted = await db('notifications').where({ id }).first() as NotificationRow;
  logger.info(
    { notificationId: inserted.id, eventType: input.eventType, severity: input.severity },
    `notification[${input.severity}] ${input.eventType}`,
  );
  return inserted;
}

export async function markRead(notificationId: number, userId: number): Promise<void> {
  const n = await db('notifications').where({ id: notificationId }).first() as NotificationRow | undefined;
  if (!n) throw new Error('NOTIFICATION_NOT_FOUND');

  const user = await db('users').where({ id: userId }).select('role').first() as { role: string } | undefined;
  const isRecipient =
    n.recipient_user_id === userId ||
    (n.recipient_role !== null && user?.role === n.recipient_role);

  if (!isRecipient) throw new Error('NOTIFICATION_FORBIDDEN');
  if (n.read_at) return;

  await db('notifications').where({ id: notificationId }).update({ read_at: db.fn.now() });
}

export async function markAllRead(userId: number): Promise<{ updated: number }> {
  const user = await db('users').where({ id: userId }).select('role').first() as { role: string } | undefined;
  if (!user) throw new Error('USER_NOT_FOUND');

  const result = await db('notifications')
    .whereNull('read_at')
    .whereNull('archived_at')
    .where((qb) =>
      qb.where('recipient_user_id', userId).orWhere('recipient_role', user.role),
    )
    .update({ read_at: db.fn.now() });

  return { updated: result };
}

export async function resolve(
  notificationId: number,
  resolution: 'approved' | 'rejected' | 'acknowledged',
  ownerUserId: number,
): Promise<NotificationRow> {
  const n = await db('notifications').where({ id: notificationId }).first() as NotificationRow | undefined;
  if (!n) throw new Error('NOTIFICATION_NOT_FOUND');
  if (n.resolved_at) throw new Error('NOTIFICATION_ALREADY_RESOLVED');

  await db('notifications').where({ id: notificationId }).update({
    resolved_at: db.fn.now(),
    resolved_by_user_id: ownerUserId,
    resolution,
    read_at: db.fn.now(),
  });
  const updated = await db('notifications').where({ id: notificationId }).first() as NotificationRow;

  if (resolution === 'approved' && n.is_blocking && n.blocked_action_payload_jsonb) {
    await dispatch(n.blocked_action_payload_jsonb as Record<string, unknown>, ownerUserId);
  }

  return updated;
}

export async function listForUser(
  userId: number,
  userRole: string,
  opts: {
    includeRead?: boolean;
    includeArchived?: boolean;
    severity?: string;
    eventType?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<{ rows: NotificationRow[]; total: number }> {
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 20;
  const offset = (page - 1) * limit;

  const base = db('notifications').where((qb) =>
    qb.where('recipient_user_id', userId).orWhere('recipient_role', userRole),
  );

  if (!opts.includeRead) base.whereNull('read_at');
  if (!opts.includeArchived) base.whereNull('archived_at');
  if (opts.severity) base.where('severity', opts.severity);
  if (opts.eventType) base.where('event_type', opts.eventType);
  if (opts.from) base.where('created_at', '>=', opts.from);
  if (opts.to) base.where('created_at', '<=', opts.to);

  const [countRow] = await base.clone().clearSelect().count<Array<{ count: string }>>('id as count');
  const rows = await base.clone().select('*').orderBy('created_at', 'desc').limit(limit).offset(offset);

  return { rows: rows as NotificationRow[], total: Number((countRow as { count: string }).count) };
}

export async function unreadCount(userId: number, userRole: string): Promise<number> {
  const [row] = await db('notifications')
    .where((qb) => qb.where('recipient_user_id', userId).orWhere('recipient_role', userRole))
    .whereNull('read_at')
    .whereNull('archived_at')
    .count<Array<{ count: string }>>('id as count');

  return Number((row as { count: string }).count);
}
