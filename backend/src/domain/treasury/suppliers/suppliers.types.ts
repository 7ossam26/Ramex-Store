export type Currency = 'EGP' | 'RMB';

export type Unit = 'kg' | 'meter' | 'roll' | 'piece';

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

export type SupplierInvoiceLine = {
  id: number;
  supplier_invoice_id: number;
  description: string;
  quantity: string;
  unit: Unit;
  unit_price: string;
  line_total: string;
};

export type SupplierInvoiceWithLines = SupplierInvoice & {
  lines: SupplierInvoiceLine[];
};

/**
 * Purchase return (مرتجع مشتريات) — mirror of {@link SupplierInvoice} but a
 * balance-*decreasing* (credit) document. `amount_egp` is kept equal to `total`.
 */
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

export type SupplierReturnLine = {
  id: number;
  supplier_return_id: number;
  description: string;
  quantity: string;
  unit: Unit;
  unit_price: string;
  line_total: string;
};

export type SupplierReturnWithLines = SupplierReturn & {
  lines: SupplierReturnLine[];
};

/** A computed line ready for insertion (line_total already rounded). */
export type ComputedLine = {
  description: string;
  quantity: number;
  unit: Unit;
  unit_price: number;
  line_total: number;
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
  total_returned_egp: number;
  balance_egp: number;
};

export type SupplierBalance = {
  currency: Currency;
  opening_balance: number;
  total_invoiced_egp: number;
  total_paid_egp: number;
  total_returned_egp: number;
  balance_egp: number;
};

export type SupplierLedgerEntry =
  | ({ kind: 'invoice' } & SupplierInvoice)
  | ({ kind: 'payment' } & SupplierPayment)
  | ({ kind: 'return' } & SupplierReturn);
