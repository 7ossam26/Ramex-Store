import { api } from './api';
import type { Customer, CustomerDetail, LedgerEntry } from './customers-types';

// ─── Account statement (Phase 3 engine, EGP-only on the customer side) ─────────

export type StatementLineItem = {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
};

export type StatementRow = {
  date: string;
  createdAt: string;
  kind: 'invoice' | 'payment' | 'opening' | 'adjustment';
  ref: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  lineItems?: StatementLineItem[];
};

export type CustomerStatement = {
  titleAr: string;
  currency: 'EGP';
  from: string;
  to: string;
  broughtForward: number;
  rows: StatementRow[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
};

export type StatementVariant = 'summary' | 'detailed';
export type StatementExportFormat = 'pdf' | 'excel' | 'print';

/** Authenticated export/print URL — token in the query so `<a>`/new-tab links auth. */
export function customerStatementExportUrl(
  id: number,
  params: { from: string; to: string; variant: StatementVariant; format: StatementExportFormat },
): string {
  const token = localStorage.getItem('ramex_token') ?? '';
  const query = new URLSearchParams({ ...params, token }).toString();
  return `/api/customers/${id}/statement?${query}`;
}

export const customersApi = {
  list: (params?: { search?: string; sort?: string; page?: number; limit?: number }) =>
    api
      .get<{ rows: Customer[]; total: number }>('/customers', { params })
      .then((r) => r.data),

  get: (id: number, params?: { page?: number; limit?: number }) =>
    api.get<CustomerDetail>(`/customers/${id}`, { params }).then((r) => r.data),

  create: (body: {
    name_ar: string;
    phone: string;
    phone_secondary?: string | null;
    address_ar?: string | null;
    tax_no?: string | null;
    notes_ar?: string | null;
  }) => api.post<Customer>('/customers', body).then((r) => r.data),

  quickCreate: (body: { name_ar: string; phone: string }) =>
    api.post<Customer>('/customers/quick', body).then((r) => r.data),

  update: (
    id: number,
    body: {
      name_ar?: string;
      phone?: string;
      phone_secondary?: string | null;
      address_ar?: string | null;
      tax_no?: string | null;
      notes_ar?: string | null;
    },
  ) => api.patch<Customer>(`/customers/${id}`, body).then((r) => r.data),

  byPhone: (phone: string) =>
    api.get<Customer>(`/customers/by-phone/${phone}`).then((r) => r.data),

  getLedger: (id: number, params?: { page?: number; limit?: number }) =>
    api
      .get<{ rows: LedgerEntry[]; total: number; page: number; limit: number }>(
        `/customers/${id}/ledger`,
        { params },
      )
      .then((r) => r.data),

  getStatement: (id: number, from: string, to: string) =>
    api
      .get<CustomerStatement>(`/customers/${id}/statement`, { params: { from, to, format: 'json' } })
      .then((r) => r.data),

  // Signed amount in ledger convention: negative = customer owes us (مدين),
  // positive = customer has credit (دائن).
  setOpeningBalance: (
    id: number,
    body: { amount: number; as_of_date: string; notes_ar?: string | null },
  ) =>
    api
      .post<{ customer: Customer; entry: LedgerEntry }>(`/customers/${id}/opening-balance`, body)
      .then((r) => r.data),

  recordReceipt: (id: number, body: { amount: number; notes_ar?: string | null }) =>
    api
      .post<{ customer: Customer; entry: LedgerEntry }>(`/customers/${id}/receipts`, body)
      .then((r) => r.data),
};
