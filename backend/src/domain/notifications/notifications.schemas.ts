import { z } from 'zod';

export const listNotificationsSchema = z.object({
  include_read: z.coerce.boolean().optional(),
  include_archived: z.coerce.boolean().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  event_type: z.string().max(64).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const resolveNotificationSchema = z.object({
  resolution: z.enum(['approved', 'rejected', 'acknowledged']),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsSchema>;
export type ResolveNotificationBody = z.infer<typeof resolveNotificationSchema>;
