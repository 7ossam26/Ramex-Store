import { api } from './api';

export type SettingVersionRow = {
  id: number;
  key: string;
  previous_value_jsonb: unknown;
  new_value_jsonb: unknown;
  actor_user_id: number;
  actor_username: string | null;
  created_at: string;
};

export const settingsApi = {
  getAll: (): Promise<Record<string, unknown>> =>
    api.get('/settings').then((r) => r.data),

  get: (key: string): Promise<{ key: string; value: unknown }> =>
    api.get(`/settings/${encodeURIComponent(key)}`).then((r) => r.data),

  set: (key: string, value: unknown): Promise<{ ok: boolean }> =>
    api.patch(`/settings/${encodeURIComponent(key)}`, { value }).then((r) => r.data),

  history: (key: string, limit = 50): Promise<SettingVersionRow[]> =>
    api.get(`/settings/${encodeURIComponent(key)}/history`, { params: { limit } }).then((r) => r.data),
};

export type PermissionRow = {
  id: number;
  role: string;
  resource: string;
  action: string;
  is_allowed: boolean;
};

export const permissionsApi = {
  getMatrix: (): Promise<PermissionRow[]> =>
    api.get('/permissions').then((r) => r.data),

  bulkUpdate: (updates: Array<{ role: string; resource: string; action: string; is_allowed: boolean }>): Promise<{ ok: boolean; updated: number }> =>
    api.patch('/permissions', updates).then((r) => r.data),
};

export type UserRow = {
  id: number;
  username: string;
  full_name_ar: string;
  role: string;
  is_active: boolean;
  created_at: string;
  force_password_change?: boolean;
  last_login_at?: string | null;
  locked_until?: string | null;
};

export type UserPermissionsData = {
  role: string;
  roleMatrix: PermissionRow[];
  overrides: Array<{ id: number; user_id: number; resource: string; action: string; is_allowed: boolean }>;
};

export const usersApi = {
  list: (): Promise<UserRow[]> =>
    api.get('/users').then((r) => r.data),

  create: (data: { username: string; full_name_ar: string; role: string; password: string; force_password_change?: boolean }): Promise<UserRow> =>
    api.post('/users', data).then((r) => r.data),

  update: (id: number, data: Partial<{ username: string; full_name_ar: string; role: string; password: string; is_active: boolean }>): Promise<UserRow> =>
    api.patch(`/users/${id}`, data).then((r) => r.data),

  delete: (id: number): Promise<{ ok: boolean }> =>
    api.delete(`/users/${id}`).then((r) => r.data),

  resetPassword: (id: number, password: string, forceChange = false): Promise<{ ok: boolean }> =>
    api.post(`/users/${id}/reset-password`, { password, force_password_change: forceChange }).then((r) => r.data),

  getPermissions: (id: number): Promise<UserPermissionsData> =>
    api.get(`/users/${id}/permissions`).then((r) => r.data),

  updatePermissions: (
    id: number,
    updates: Array<{ resource: string; action: string; is_allowed: boolean | null }>,
  ): Promise<{ ok: boolean; updated: number }> =>
    api.patch(`/users/${id}/permissions`, updates).then((r) => r.data),
};

export type BankAccount = {
  id: number;
  name_ar: string;
  bank_name_ar: string | null;
  branch_ar: string | null;
  account_number: string | null;
  is_active: boolean;
  is_default: boolean;
  current_balance_egp: string;
};

export const adminApi = {
  /** Wipes all operational data. super_admin only; requires phrase + password. */
  resetDatabase: (data: { confirmPhrase: string; password: string }): Promise<{ ok: boolean; wipedTables: number }> =>
    api.post('/admin/reset-database', data).then((r) => r.data),

  /** Zeros bank accounts, cash drawer, and current-year invoice sequence. super_admin only. */
  resetBalancesAndSales: (data: { confirmPhrase: string; password: string }): Promise<{ ok: boolean }> =>
    api.post('/admin/reset-balances-sales', data).then((r) => r.data),

  /** Same as resetBalancesAndSales + zeros customer balances and lifetime volume. super_admin only. */
  resetBalancesSalesAndCustomers: (data: { confirmPhrase: string; password: string }): Promise<{ ok: boolean }> =>
    api.post('/admin/reset-balances-sales-customers', data).then((r) => r.data),
};

export const bankAccountsApi = {
  list: (): Promise<BankAccount[]> =>
    api.get('/bank-accounts').then((r) => r.data),

  create: (data: { name_ar: string; bank_name_ar?: string; account_number?: string }): Promise<BankAccount> =>
    api.post('/bank-accounts', data).then((r) => r.data),

  update: (id: number, data: Partial<{ name_ar: string; bank_name_ar: string; is_active: boolean; is_default: boolean }>): Promise<BankAccount> =>
    api.patch(`/bank-accounts/${id}`, data).then((r) => r.data),
};
