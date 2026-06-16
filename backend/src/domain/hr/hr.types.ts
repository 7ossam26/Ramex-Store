export type HrEmployee = {
  id: number;
  name_ar: string;
  phone: string | null;
  role_ar: string | null;
  base_salary_egp: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type HrSalaryDisbursement = {
  id: number;
  employee_id: number;
  month: string;
  gross_egp: string;
  adjustments_egp: string;
  advance_repayment_egp: string;
  net_egp: string;
  paid_via: 'cash' | 'instapay' | 'bank_transfer';
  bank_account_id: number | null;
  notes_ar: string | null;
  actor_user_id: number;
  created_at: string;
  employee_name_ar?: string;
  actor_username?: string | null;
  bank_name_ar?: string | null;
};

export type HrSalaryAdjustment = {
  id: number;
  employee_id: number;
  kind: 'advance' | 'deduction';
  amount_egp: string;
  salary_month: string;
  reason_ar: string | null;
  actor_user_id: number;
  created_at: string;
  employee_name_ar?: string;
  actor_username?: string | null;
};

export type HrAdvanceRepayment = {
  id: number;
  employee_id: number;
  disbursement_id: number | null;
  amount_egp: string;
  paid_via: 'cash' | 'instapay' | 'bank_transfer' | null;
  bank_account_id: number | null;
  notes_ar: string | null;
  actor_user_id: number;
  created_at: string;
};

export type HrSalaryPreview = {
  employee_id: number;
  name_ar: string;
  base_salary_egp: number;
  deductions_egp: number;
  outstanding_advance_egp: number;
  net_egp: number;
  already_disbursed: boolean;
  disbursement_id: number | null;
};
