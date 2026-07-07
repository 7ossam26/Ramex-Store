export type Currency = 'EGP' | 'RMB';

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
  supplier_name?: string;
  bank_name_ar?: string | null;
  actor_username?: string | null;
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
  balance_egp: number;
};

export type SupplierBalance = {
  currency: Currency;
  opening_balance: number;
  total_invoiced_egp: number;
  total_paid_egp: number;
  balance_egp: number;
};

export type SupplierLedgerEntry =
  | ({ kind: 'invoice' } & SupplierInvoice)
  | ({ kind: 'payment' } & SupplierPayment);
