import { api } from './api';

export type SupplierWithBalance = {
  id: number;
  arabic_name: string;
  english_name: string | null;
  phone: string | null;
  is_active: boolean;
  total_invoiced_egp: number;
  total_paid_egp: number;
  balance_egp: number;
};

export type SupplierInvoice = {
  id: number;
  supplier_id: number;
  invoice_no: string | null;
  invoice_date: string;
  amount_egp: string;
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

export type SupplierLedger = {
  invoices: SupplierInvoice[];
  payments: SupplierPayment[];
  balance: {
    total_invoiced_egp: number;
    total_paid_egp: number;
    balance_egp: number;
  };
};

export const suppliersApi = {
  list: (): Promise<SupplierWithBalance[]> =>
    api.get('/treasury/suppliers').then((r) => r.data),

  getLedger: (id: number): Promise<SupplierLedger> =>
    api.get(`/treasury/suppliers/${id}/ledger`).then((r) => r.data),

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
};
