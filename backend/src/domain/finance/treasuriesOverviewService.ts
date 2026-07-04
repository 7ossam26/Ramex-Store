import { db } from '../../db/connection.js';

type CashMovementRow = {
  id: number;
  direction: 'in' | 'out';
  event_type: string;
  amount_egp: string;
  balance_after_egp: string;
  reference_type: string | null;
  reference_id: number | null;
  notes_ar: string | null;
  actor_username: string | null;
  created_at: string;
};

type BankMovementRow = {
  id: number;
  bank_account_id: number;
  bank_name_ar: string | null;
  direction: 'in' | 'out';
  event_type: string;
  amount_egp: string;
  balance_after_egp: string;
  reference_type: string | null;
  reference_id: number | null;
  notes_ar: string | null;
  actor_username: string | null;
  created_at: string;
};

type BankAccountSummary = {
  bank_account_id: number;
  name_ar: string;
  bank_name_ar: string | null;
  account_number_masked: string | null;
  balance_egp: string;
  is_default: boolean;
};

function cairoIsoNow(): string {
  const now = new Date();
  const cairoMs = now.getTime() + 2 * 3600 * 1000;
  return new Date(cairoMs).toISOString().replace('Z', '+02:00');
}

function maskAccountNumber(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.length <= 4) return '****';
  return `**** ${raw.slice(-4)}`;
}

export async function getTreasuriesOverview() {
  const [cashDrawerRow, recentCashRaw, bankAccounts, recentBankRaw, generalVaultRow] = await Promise.all([
    db('cash_drawer').where({ id: 1 }).first() as Promise<{
      current_balance_egp: string;
      opening_balance_egp: string;
      last_movement_at: string | null;
    }>,

    db('cash_movements as cm')
      .leftJoin('users as u', 'cm.actor_user_id', 'u.id')
      .select('cm.id', 'cm.direction', 'cm.event_type', 'cm.amount_egp',
        'cm.balance_after_egp', 'cm.reference_type', 'cm.reference_id',
        'cm.notes_ar', 'cm.created_at', 'u.username as actor_username')
      .orderBy('cm.created_at', 'desc')
      .limit(10) as Promise<CashMovementRow[]>,

    db('bank_accounts')
      .where({ is_active: true })
      .orderBy('is_default', 'desc')
      .orderBy('name_ar') as Promise<Array<{
        id: number;
        name_ar: string;
        bank_name_ar: string | null;
        account_number: string | null;
        current_balance_egp: string;
        is_default: boolean;
      }>>,

    db('bank_movements as bm')
      .leftJoin('bank_accounts as ba', 'bm.bank_account_id', 'ba.id')
      .leftJoin('users as u', 'bm.actor_user_id', 'u.id')
      .select('bm.id', 'bm.bank_account_id', 'bm.direction', 'bm.event_type',
        'bm.amount_egp', 'bm.balance_after_egp', 'bm.reference_type',
        'bm.reference_id', 'bm.notes_ar', 'bm.created_at',
        'ba.name_ar as bank_name_ar', 'u.username as actor_username')
      .orderBy('bm.created_at', 'desc')
      .limit(10) as Promise<BankMovementRow[]>,

    db('general_vault').where({ id: 1 }).first() as Promise<{
      current_balance_egp: string;
      last_movement_at: string | null;
    }>,
  ]);

  const bankTotal = bankAccounts.reduce(
    (sum, a) => sum + Number(a.current_balance_egp),
    0,
  );

  const byAccount: BankAccountSummary[] = bankAccounts.map((a) => ({
    bank_account_id: a.id,
    name_ar: a.name_ar,
    bank_name_ar: a.bank_name_ar,
    account_number_masked: maskAccountNumber(a.account_number),
    balance_egp: Number(a.current_balance_egp).toFixed(2),
    is_default: Boolean(a.is_default),
  }));

  return {
    as_of: cairoIsoNow(),
    cash: {
      total_egp: Number(cashDrawerRow.current_balance_egp).toFixed(2),
      by_branch: [
        {
          branch_id: 1,
          branch_name_ar: 'الفرع الرئيسي',
          balance_egp: Number(cashDrawerRow.current_balance_egp).toFixed(2),
        },
      ],
      recent_movements: recentCashRaw.map((m) => ({
        id: m.id,
        direction: m.direction,
        event_type: m.event_type,
        amount_egp: Number(m.amount_egp).toFixed(2),
        balance_after_egp: Number(m.balance_after_egp).toFixed(2),
        notes_ar: m.notes_ar,
        actor_username: m.actor_username,
        created_at: m.created_at,
      })),
    },
    bank: {
      total_egp: bankTotal.toFixed(2),
      by_account: byAccount,
      recent_movements: recentBankRaw.map((m) => ({
        id: m.id,
        bank_account_id: m.bank_account_id,
        bank_name_ar: m.bank_name_ar,
        direction: m.direction,
        event_type: m.event_type,
        amount_egp: Number(m.amount_egp).toFixed(2),
        balance_after_egp: Number(m.balance_after_egp).toFixed(2),
        notes_ar: m.notes_ar,
        actor_username: m.actor_username,
        created_at: m.created_at,
      })),
    },
    general_vault: {
      balance_egp: Number(generalVaultRow.current_balance_egp).toFixed(2),
      last_movement_at: generalVaultRow.last_movement_at,
    },
  };
}
