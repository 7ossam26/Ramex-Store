import * as notificationsService from '../notifications/notificationsService.js';
import type { NotificationRow } from '../notifications/notificationsService.js';

/** All blocking notifications that are unresolved, visible to the given user/role. */
export async function listPending(
  forUserId: number,
  forRole: string,
): Promise<NotificationRow[]> {
  const { rows } = await notificationsService.listForUser(forUserId, forRole, {
    includeRead: true,
    includeArchived: false,
    limit: 200,
  });
  return rows.filter((n) => n.is_blocking && n.resolved_at === null);
}

/** All resolved blocking notifications visible to the given user/role. */
export async function listResolved(
  forUserId: number,
  forRole: string,
  page = 1,
  limit = 30,
): Promise<{ rows: NotificationRow[]; total: number }> {
  const { rows: all } = await notificationsService.listForUser(forUserId, forRole, {
    includeRead: true,
    includeArchived: true,
    limit: 1000,
  });
  const resolved = all.filter((n) => n.is_blocking && n.resolved_at !== null);
  const total    = resolved.length;
  const offset   = (page - 1) * limit;
  return { rows: resolved.slice(offset, offset + limit), total };
}

export async function approve(
  notificationId: number,
  userId: number,
): Promise<NotificationRow> {
  return notificationsService.resolve(notificationId, 'approved', userId);
}

export async function reject(
  notificationId: number,
  userId: number,
): Promise<NotificationRow> {
  return notificationsService.resolve(notificationId, 'rejected', userId);
}
