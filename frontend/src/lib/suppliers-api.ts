import { api } from './api';

export type Currency = 'EGP' | 'RMB';

export type Unit = 'kg' | 'meter' | 'roll' | 'piece';

export type SupplierInvoiceLine = {
  id: number;
  supplier_invoice_id: number;
  description: string;
  quantity: string;
  unit: Unit;
  unit_price: string;
  line_total: string;
};

export type SupplierInvoiceLineInput = {
  description: string;
  quantity: number;
  unit: Unit;
  unit_price: number;
};

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
  total_returned_egp: number;
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
  internal_no: string | null;
  invoice_date: string;
  due_date: string | null;
  amount_egp: string;
  subtotal: string;
  extra_charges: string;
  total: string;
  currency: Currency;
  notes_ar: string | null;
  source: 'manual' | 'shipment_receive';
  source_ref: number | null;
  created_by_user_id: number;
  created_at: string;
  supplier_name?: string;
};

export type SupplierInvoiceWithLines = SupplierInvoice & {
  lines: SupplierInvoiceLine[];
};

export type SupplierReturnLine = {
  id: number;
  supplier_return_id: number;
  description: string;
  quantity: string;
  unit: Unit;
  unit_price: string;
  line_total: string;
};

/** Purchase return (مرتجع مشتريات) — credit-side mirror of a purchase invoice. */
export type SupplierReturn = {
  id: number;
  supplier_id: number;
  return_no: string | null;
  internal_no: string | null;
  return_date: string;
  amount_egp: string;
  subtotal: string;
  extra_charges: string;
  total: string;
  currency: Currency;
  notes_ar: string | null;
  created_by_user_id: number;
  created_at: string;
  supplier_name?: string;
};

export type SupplierReturnWithLines = SupplierReturn & {
  lines: SupplierReturnLine[];
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
  total_returned_egp: number;
  balance_egp: number;
};

export type SupplierLedger = {
  supplier: Supplier | null;
  invoices: SupplierInvoice[];
  payments: SupplierPayment[];
  returns: SupplierReturn[];
  balance: SupplierBalance;
};

// ─── Account statement ────────────────────────────────────────────────────────

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
  kind: 'invoice' | 'payment' | 'opening' | 'adjustment' | 'purchase_return';
  ref: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  lineItems?: StatementLineItem[];
};

export type SupplierStatement = {
  titleAr: string;
  currency: Currency;
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
export function supplierStatementExportUrl(
  id: number,
  params: { from: string; to: string; variant: StatementVariant; format: StatementExportFormat },
): string {
  const token = localStorage.getItem('ramex_token') ?? '';
  const query = new URLSearchParams({ ...params, token }).toString();
  return `/api/treasury/suppliers/${id}/statement?${query}`;
}

export const suppliersApi = {
  list: (): Promise<SupplierWithBalance[]> =>
    api.get('/treasury/suppliers').then((r) => r.data),

  getLedger: (id: number): Promise<SupplierLedger> =>
    api.get(`/treasury/suppliers/${id}/ledger`).then((r) => r.data),

  getStatement: (id: number, from: string, to: string): Promise<SupplierStatement> =>
    api.get(`/treasury/suppliers/${id}/statement`, { params: { from, to, format: 'json' } }).then((r) => r.data),

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
    due_date?: string | null;
    extra_charges?: number;
    lines: SupplierInvoiceLineInput[];
    notes_ar?: string | null;
  }): Promise<SupplierInvoiceWithLines> =>
    api.post('/treasury/suppliers/invoices', data).then((r) => r.data),

  getInvoice: (id: number): Promise<SupplierInvoiceWithLines> =>
    api.get(`/treasury/suppliers/invoices/${id}`).then((r) => r.data),

  updateInvoice: (
    id: number,
    data: {
      invoice_no?: string | null;
      invoice_date?: string;
      due_date?: string | null;
      extra_charges?: number;
      lines?: SupplierInvoiceLineInput[];
      notes_ar?: string | null;
    },
  ): Promise<SupplierInvoiceWithLines> =>
    api.patch(`/treasury/suppliers/invoices/${id}`, data).then((r) => r.data),

  deleteInvoice: (id: number): Promise<{ ok: true }> =>
    api.delete(`/treasury/suppliers/invoices/${id}`).then((r) => r.data),

  createReturn: (data: {
    supplier_id: number;
    return_no?: string | null;
    return_date: string;
    extra_charges?: number;
    lines: SupplierInvoiceLineInput[];
    notes_ar?: string | null;
  }): Promise<SupplierReturnWithLines> =>
    api.post('/treasury/suppliers/returns', data).then((r) => r.data),

  getReturn: (id: number): Promise<SupplierReturnWithLines> =>
    api.get(`/treasury/suppliers/returns/${id}`).then((r) => r.data),

  updateReturn: (
    id: number,
    data: {
      return_no?: string | null;
      return_date?: string;
      extra_charges?: number;
      lines?: SupplierInvoiceLineInput[];
      notes_ar?: string | null;
    },
  ): Promise<SupplierReturnWithLines> =>
    api.patch(`/treasury/suppliers/returns/${id}`, data).then((r) => r.data),

  deleteReturn: (id: number): Promise<{ ok: true }> =>
    api.delete(`/treasury/suppliers/returns/${id}`).then((r) => r.data),

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
