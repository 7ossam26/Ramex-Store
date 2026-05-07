import type { RequestHandler } from 'express';
import * as svc from './notificationsService.js';
import { listNotificationsSchema, resolveNotificationSchema } from './notifications.schemas.js';

export const listNotifications: RequestHandler = async (req, res) => {
  const query = listNotificationsSchema.parse(req.query);
  const userId = req.user!.sub;
  const userRole = req.user!.role;

  const result = await svc.listForUser(userId, userRole, {
    includeRead: query.include_read,
    includeArchived: query.include_archived,
    severity: query.severity,
    eventType: query.event_type,
    from: query.from,
    to: query.to,
    page: query.page,
    limit: query.limit,
  });

  res.json(result);
};

export const getUnreadCount: RequestHandler = async (req, res) => {
  const userId = req.user!.sub;
  const userRole = req.user!.role;
  const count = await svc.unreadCount(userId, userRole);
  res.json({ count });
};

export const markRead: RequestHandler = async (req, res) => {
  const notifId = Number(req.params.id);
  const userId = req.user!.sub;
  await svc.markRead(notifId, userId);
  res.json({ ok: true });
};

export const markAllRead: RequestHandler = async (req, res) => {
  const userId = req.user!.sub;
  const result = await svc.markAllRead(userId);
  res.json(result);
};

export const resolveNotification: RequestHandler = async (req, res) => {
  const notifId = Number(req.params.id);
  const body = resolveNotificationSchema.parse(req.body);
  const ownerUserId = req.user!.sub;

  const notification = await svc.resolve(notifId, body.resolution, ownerUserId);
  res.json(notification);
};
