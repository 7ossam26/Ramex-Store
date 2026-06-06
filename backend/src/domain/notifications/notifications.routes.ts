import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/auth.js';
import {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  resolveNotification,
} from './notifications.controller.js';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get('/', listNotifications);
notificationsRouter.get('/unread-count', getUnreadCount);
notificationsRouter.post('/read-all', markAllRead);
notificationsRouter.post('/:id/read', markRead);
notificationsRouter.post('/:id/resolve', requireRole('super_admin'), resolveNotification);
