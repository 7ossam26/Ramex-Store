export type CashEventType =
  | 'sale_payment'
  | 'deposit_payment'
  | 'refund'
  | 'expense'
  | 'cash_to_bank'
  | 'owner_withdrawal'
  | 'opening_balance_set'
  | 'reconciliation_adjustment';

export type BankEventType =
  | 'instapay_payment'
  | 'cash_deposit'
  | 'refund'
  | 'reconciliation_adjustment'
  | 'opening_balance_set'
  | 'other_in'
  | 'other_out';

export type CashDrawerBalance = {
  current_balance_egp: number;
  opening_balance_egp: number;
  opening_set_at: string | null;
  last_movement_at: string | null;
};

export type CashMovement = {
  id: number;
  direction: 'in' | 'out';
  event_type: CashEventType;
  amount_egp: string;
  reference_type: string | null;
  reference_id: number | null;
  balance_after_egp: string;
  notes_ar: string | null;
  actor_user_id: number;
  actor_username: string | null;
  created_at: string;
};

export type BankAccount = {
  id: number;
  name_ar: string;
  bank_name_ar: string | null;
  branch_ar: string | null;
  iban: string | null;
  account_number: string | null;
  notes_ar: string | null;
  is_active: boolean;
  is_default: boolean;
  current_balance_egp: string;
  created_at: string;
  updated_at: string;
};

export type BankMovement = {
  id: number;
  bank_account_id: number;
  direction: 'in' | 'out';
  event_type: BankEventType;
  amount_egp: string;
  reference_type: string | null;
  reference_id: number | null;
  balance_after_egp: string;
  notes_ar: string | null;
  actor_user_id: number;
  actor_username: string | null;
  created_at: string;
};

export type Expense = {
  id: number;
  category: string;
  amount_egp: string;
  notes_ar: string | null;
  photo_path: string | null;
  requires_approval: boolean;
  approved_by_user_id: number | null;
  approved_at: string | null;
  paid_from: 'cash' | 'bank';
  bank_account_id: number | null;
  actor_user_id: number;
  actor_username: string | null;
  approved_by_username: string | null;
  created_at: string;
};

export type ReconciliationResult = {
  id: number;
  variance_egp: number;
};

export type TreasuriesOverviewCashMovement = {
  id: number;
  direction: 'in' | 'out';
  event_type: string;
  amount_egp: string;
  balance_after_egp: string;
  notes_ar: string | null;
  actor_username: string | null;
  created_at: string;
};

export type TreasuriesOverviewBankMovement = {
  id: number;
  bank_account_id: number;
  bank_name_ar: string | null;
  direction: 'in' | 'out';
  event_type: string;
  amount_egp: string;
  balance_after_egp: string;
  notes_ar: string | null;
  actor_username: string | null;
  created_at: string;
};

export type TreasuriesOverviewBankAccount = {
  bank_account_id: number;
  name_ar: string;
  bank_name_ar: string | null;
  account_number_masked: string | null;
  balance_egp: string;
  is_default: boolean;
};

export type TreasuriesOverview = {
  as_of: string;
  cash: {
    total_egp: string;
    by_branch: Array<{ branch_id: number; branch_name_ar: string; balance_egp: string }>;
    recent_movements: TreasuriesOverviewCashMovement[];
  };
  bank: {
    total_egp: string;
    by_account: TreasuriesOverviewBankAccount[];
    recent_movements: TreasuriesOverviewBankMovement[];
  };
};
