import { api } from './api';

export type Currency = 'EGP' | 'RMB';

export type SupplierWithBalance = {
  id: number;
  arabic_name: string;
  english_name: string | null;
  phone: string | null;
  currency: Currency;
  opening_balance: number;
  opening_balance_date: string | null;
  is_active: boolean;
  total_invoiced_egp: number;
  total_paid_egp: number;
  balance_egp: number;
};

export type Supplier = {
  id: number;
  arabic_name: string;
  english_name: string | null;
  phone: string | null;
  currency: Currency;
  opening_balance: string;
  opening_balance_date: string | null;
  is_active: boolean;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

export type SupplierInvoice = {
  id: number;
  supplier_id: number;
  invoice_no: string | null;
  invoice_date: string;
  amount_egp: string;
  currency: Currency;
  notes_ar: string | null;
  source: 'manual' | 'shipment_receive';
  source_ref: number | null;
  created_by_user_id: number;
  created_at: string;
  supplier_name?: string;
};

export type SupplierPayment = {
  id: number;
  supplier_id: number;
  amount_egp: string;
  currency: Currency;
  paid_at: string;
  method: 'cash' | 'instapay' | 'bank_transfer';
  bank_account_id: number | null;
  notes_ar: string | null;
  actor_user_id: number;
  created_at: string;
  bank_name_ar?: string | null;
  actor_username?: string | null;
  supplier_name?: string;
};

export type SupplierBalance = {
  currency: Currency;
  opening_balance: number;
  total_invoiced_egp: number;
  total_paid_egp: number;
  balance_egp: number;
};

export type SupplierLedger = {
  supplier: Supplier | null;
  invoices: SupplierInvoice[];
  payments: SupplierPayment[];
  balance: SupplierBalance;
};

export const suppliersApi = {
  list: (): Promise<SupplierWithBalance[]> =>
    api.get('/treasury/suppliers').then((r) => r.data),

  getLedger: (id: number): Promise<SupplierLedger> =>
    api.get(`/treasury/suppliers/${id}/ledger`).then((r) => r.data),

  createSupplier: (data: {
    arabic_name: string;
    english_name?: string | null;
    phone?: string | null;
    currency: Currency;
    opening_balance?: number;
    opening_balance_date?: string | null;
  }): Promise<Supplier> =>
    api.post('/treasury/suppliers', data).then((r) => r.data),

  updateSupplier: (
    id: number,
    data: {
      arabic_name?: string;
      english_name?: string | null;
      phone?: string | null;
      currency?: Currency;
      opening_balance?: number;
      opening_balance_date?: string | null;
    },
  ): Promise<Supplier> =>
    api.patch(`/treasury/suppliers/${id}`, data).then((r) => r.data),

  deactivateSupplier: (id: number): Promise<{ ok: true }> =>
    api.post(`/treasury/suppliers/${id}/deactivate`).then((r) => r.data),

  createInvoice: (data: {
    supplier_id: number;
    invoice_no?: string | null;
    invoice_date: string;
    amount_egp: number;
    notes_ar?: string | null;
  }): Promise<SupplierInvoice> =>
    api.post('/treasury/suppliers/invoices', data).then((r) => r.data),

  recordPayment: (data: {
    supplier_id: number;
    amount_egp: number;
    paid_at?: string;
    method: 'cash' | 'instapay' | 'bank_transfer';
    bank_account_id?: number | null;
    notes_ar?: string | null;
  }): Promise<SupplierPayment> =>
    api.post('/treasury/suppliers/payments', data).then((r) => r.data),

  updatePayment: (
    id: number,
    data: {
      amount_egp?: number;
      paid_at?: string;
      method?: 'cash' | 'instapay' | 'bank_transfer';
      bank_account_id?: number | null;
      notes_ar?: string | null;
    },
  ): Promise<SupplierPayment> =>
    api.patch(`/treasury/suppliers/payments/${id}`, data).then((r) => r.data),

  deletePayment: (id: number): Promise<{ ok: true }> =>
    api.delete(`/treasury/suppliers/payments/${id}`).then((r) => r.data),
};
