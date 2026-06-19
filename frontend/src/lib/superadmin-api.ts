import { api } from './api';

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

export type SessionRow = {
  id: number;
  jwt_jti: string;
  device_info: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string | null;
};

export const superadminApi = {
  getAuditLog: (filters: AuditLogFilters = {}) =>
    api.get<{ rows: AuditLogEntry[]; total: number }>('/superadmin/audit-log', { params: filters }).then((r) => r.data),

  forceSignout: (userId: number) =>
    api.post(`/superadmin/users/${userId}/force-signout`).then((r) => r.data),

  forceSignoutRole: (role: string) =>
    api.post(`/superadmin/roles/${role}/force-signout`).then((r) => r.data),

  setForcePasswordChange: (userId: number) =>
    api.patch(`/superadmin/users/${userId}/force-password-change`, { value: true }).then((r) => r.data),

  getUserSessions: (userId: number) =>
    api.get<SessionRow[]>(`/superadmin/users/${userId}/sessions`).then((r) => r.data),

  revokeUserSessions: (userId: number) =>
    api.delete(`/superadmin/users/${userId}/sessions`).then((r) => r.data),

  getBackupUrl: () => {
    const token = localStorage.getItem('ramex_token') ?? '';
    return `/api/superadmin/backup/download?token=${token}`;
  },
};
