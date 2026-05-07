export type Customer = {
  id: number;
  customer_code: string;
  name_ar: string;
  phone: string;
  phone_secondary: string | null;
  address_ar: string | null;
  tax_no: string | null;
  notes_ar: string | null;
  lifetime_volume_egp: string;
  current_balance_egp: string;
  created_by_user_id: number;
  created_at: string;
  updated_at: string;
};

export type LedgerEntryType = 'sale' | 'refund' | 'payment' | 'deposit' | 'adjustment';

export type LedgerEntry = {
  id: number;
  customer_id: number;
  entry_type: LedgerEntryType;
  reference_type: string | null;
  reference_id: number | null;
  amount_egp: string;
  balance_after_egp: string;
  notes_ar: string | null;
  actor_user_id: number;
  created_at: string;
};

export type CustomerDetail = Customer & {
  ledger: {
    rows: LedgerEntry[];
    total: number;
    page: number;
    limit: number;
  };
};
