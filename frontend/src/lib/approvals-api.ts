import { api } from './api';
import type { NotificationRow } from './notifications-api';

export const approvalsApi = {
  listPending: (): Promise<{ rows: NotificationRow[]; total: number }> =>
    api.get('/approvals').then((r) => r.data),

  listResolved: (page = 1, limit = 30): Promise<{ rows: NotificationRow[]; total: number }> =>
    api.get('/approvals/resolved', { params: { page, limit } }).then((r) => r.data),

  approve: (id: number): Promise<NotificationRow> =>
    api.post(`/approvals/${id}/approve`).then((r) => r.data),

  reject: (id: number): Promise<NotificationRow> =>
    api.post(`/approvals/${id}/reject`).then((r) => r.data),
};
