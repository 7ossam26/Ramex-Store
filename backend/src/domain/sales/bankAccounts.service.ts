import { db } from '../../db/connection.js';

export type BankAccount = {
  id: number;
  name_ar: string;
  account_number: string | null;
  is_active: boolean;
  is_default: boolean;
  current_balance_egp: string;
  created_at: string;
  updated_at: string;
};

/**
 * Phase 4 read-only listing. Phase 6 adds CRUD + active toggle.
 */
export async function listActiveBankAccounts(): Promise<BankAccount[]> {
  return (await db('bank_accounts')
    .where({ is_active: true })
    .orderBy('is_default', 'desc')
    .orderBy('name_ar')) as BankAccount[];
}
