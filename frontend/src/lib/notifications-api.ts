import { api } from './api';

export type NotificationRow = {
  id: number;
  recipient_user_id: number | null;
  recipient_role: string | null;
  event_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
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
  resolution: 'approved' | 'rejected' | 'acknowledged' | null;
  created_at: string;
};

export type ListNotificationsParams = {
  include_read?: boolean;
  include_archived?: boolean;
  severity?: string;
  event_type?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};

export const notificationsApi = {
  list: (params: ListNotificationsParams = {}) =>
    api.get<{ rows: NotificationRow[]; total: number }>('/notifications', { params }),

  unreadCount: () =>
    api.get<{ count: number }>('/notifications/unread-count'),

  markRead: (id: number) =>
    api.post<{ ok: boolean }>(`/notifications/${id}/read`),

  markAllRead: () =>
    api.post<{ updated: number }>('/notifications/read-all'),

  resolve: (id: number, resolution: 'approved' | 'rejected' | 'acknowledged') =>
    api.post<NotificationRow>(`/notifications/${id}/resolve`, { resolution }),
};
