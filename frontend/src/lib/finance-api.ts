import { api } from './api';
import type {
  BankAccount,
  BankMovement,
  CashDrawerBalance,
  CashMovement,
  Expense,
  ReconciliationResult,
  TreasuriesOverview,
} from './finance-types';

export const financeApi = {
  // ── Cash Drawer ──────────────────────────────────────────────────────────
  getCashBalance: () =>
    api.get<CashDrawerBalance>('/cash/balance').then((r) => r.data),

  setOpeningBalance: (amount: number, override = false) =>
    api.post<{ ok: boolean }>('/cash/opening-balance', { amount, override }).then((r) => r.data),

  getCashMovements: (params?: { from?: string; to?: string; page?: number; limit?: number }) =>
    api
      .get<{ rows: CashMovement[]; total: number }>('/cash/movements', { params })
      .then((r) => r.data),

  reconcileCash: (body: { date: string; actual_balance_egp: number; notes_ar?: string | null }) =>
    api.post<ReconciliationResult>('/cash/reconcile', body).then((r) => r.data),

  depositToBank: (body: { amount: number; bank_account_id: number; notes_ar?: string | null }) =>
    api.post<{ ok: boolean }>('/cash/deposit-to-bank', body).then((r) => r.data),

  ownerWithdrawal: (body: { amount: number; notes_ar?: string | null }) =>
    api.post<{ ok: boolean }>('/cash/owner-withdrawal', body).then((r) => r.data),

  // ── Banks ────────────────────────────────────────────────────────────────
  listBanks: () =>
    api.get<BankAccount[]>('/banks').then((r) => r.data),

  createBank: (body: {
    name_ar: string;
    bank_name_ar?: string | null;
    branch_ar?: string | null;
    iban?: string | null;
    account_number?: string | null;
    notes_ar?: string | null;
    is_default?: boolean;
  }) => api.post<BankAccount>('/banks', body).then((r) => r.data),

  updateBank: (
    id: number,
    body: {
      name_ar?: string;
      bank_name_ar?: string | null;
      branch_ar?: string | null;
      iban?: string | null;
      account_number?: string | null;
      notes_ar?: string | null;
      is_active?: boolean;
      is_default?: boolean;
    },
  ) => api.patch<BankAccount>(`/banks/${id}`, body).then((r) => r.data),

  getBankMovements: (
    id: number,
    params?: { from?: string; to?: string; page?: number; limit?: number },
  ) =>
    api
      .get<{ rows: BankMovement[]; total: number }>(`/banks/${id}/movements`, { params })
      .then((r) => r.data),

  reconcileBank: (
    id: number,
    body: { date: string; actual_balance_egp: number; notes_ar?: string | null },
  ) => api.post<ReconciliationResult>(`/banks/${id}/reconcile`, body).then((r) => r.data),

  // ── Treasuries Overview ──────────────────────────────────────────────────
  getTreasuriesOverview: () =>
    api.get<TreasuriesOverview>('/treasuries-overview').then((r) => r.data),

  // ── Expenses ─────────────────────────────────────────────────────────────
  listExpenses: (params?: {
    category?: string;
    paid_from?: 'cash' | 'bank' | 'instapay';
    status?: 'pending' | 'approved' | 'all';
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) =>
    api
      .get<{ rows: Expense[]; total: number }>('/expenses', { params })
      .then((r) => r.data),

  createExpense: (body: {
    category: string;
    amount_egp: number;
    paid_from: 'cash' | 'bank' | 'instapay';
    bank_account_id?: number | null;
    notes_ar?: string | null;
  }) => api.post<Expense>('/expenses', body).then((r) => r.data),

  approveExpense: (id: number) =>
    api.post<Expense>(`/expenses/${id}/approve`).then((r) => r.data),

  rejectExpense: (id: number, reason_ar: string) =>
    api.post<Expense>(`/expenses/${id}/reject`, { reason_ar }).then((r) => r.data),
};
