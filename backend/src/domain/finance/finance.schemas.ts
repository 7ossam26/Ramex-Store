import { z } from 'zod';

export const SetOpeningBalanceSchema = z.object({
  amount: z.number().positive(),
  override: z.boolean().optional().default(false),
});

export const CashMovementsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

export const CashReconcileSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  actual_balance_egp: z.number(),
  notes_ar: z.string().nullable().optional(),
});

export const CashDepositToBankSchema = z.object({
  amount: z.number().positive(),
  bank_account_id: z.number().int().positive(),
  notes_ar: z.string().nullable().optional(),
});

export const OwnerWithdrawalSchema = z.object({
  amount: z.number().positive(),
  notes_ar: z.string().nullable().optional(),
});

export const CreateBankAccountSchema = z.object({
  name_ar: z.string().min(1).max(64),
  bank_name_ar: z.string().max(64).nullable().optional(),
  branch_ar: z.string().max(64).nullable().optional(),
  iban: z.string().max(64).nullable().optional(),
  account_number: z.string().max(64).nullable().optional(),
  notes_ar: z.string().nullable().optional(),
  is_default: z.boolean().optional().default(false),
});

export const UpdateBankAccountSchema = z.object({
  name_ar: z.string().min(1).max(64).optional(),
  bank_name_ar: z.string().max(64).nullable().optional(),
  branch_ar: z.string().max(64).nullable().optional(),
  iban: z.string().max(64).nullable().optional(),
  account_number: z.string().max(64).nullable().optional(),
  notes_ar: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  is_default: z.boolean().optional(),
});

export const BankMovementsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

export const BankReconcileSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  actual_balance_egp: z.number(),
  notes_ar: z.string().nullable().optional(),
});

export const CreateExpenseSchema = z.object({
  category: z.string().min(1).max(32),
  amount_egp: z.number().positive(),
  paid_from: z.enum(['cash', 'bank']),
  bank_account_id: z.number().int().positive().nullable().optional(),
  notes_ar: z.string().nullable().optional(),
});

export const RejectExpenseSchema = z.object({
  reason_ar: z.string().min(1),
});

export const ExpensesQuerySchema = z.object({
  category: z.string().optional(),
  paid_from: z.enum(['cash', 'bank']).optional(),
  status: z.enum(['pending', 'approved', 'all']).optional().default('all'),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

export type SetOpeningBalanceInput = z.infer<typeof SetOpeningBalanceSchema>;
export type CashMovementsQueryInput = z.infer<typeof CashMovementsQuerySchema>;
export type CashReconcileInput = z.infer<typeof CashReconcileSchema>;
export type CashDepositToBankInput = z.infer<typeof CashDepositToBankSchema>;
export type OwnerWithdrawalInput = z.infer<typeof OwnerWithdrawalSchema>;
export type CreateBankAccountInput = z.infer<typeof CreateBankAccountSchema>;
export type UpdateBankAccountInput = z.infer<typeof UpdateBankAccountSchema>;
export type BankMovementsQueryInput = z.infer<typeof BankMovementsQuerySchema>;
export type BankReconcileInput = z.infer<typeof BankReconcileSchema>;
export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>;
export type RejectExpenseInput = z.infer<typeof RejectExpenseSchema>;
export type ExpensesQueryInput = z.infer<typeof ExpensesQuerySchema>;
