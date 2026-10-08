import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import { auditFromService } from '../inventory/audit.helper.js';
import { notify } from '../notifications/notificationsService.js';
import { getSetting } from '../settings/settings.service.js';
import { recordMovement as cashRecordMovement } from './cashDrawerService.js';
import { recordMovement as bankRecordMovement } from './bankService.js';
import { recordMovement as vaultRecordMovement } from './generalVaultService.js';

export type ExpenseCashSource = 'cash_drawer' | 'general_vault';

export type ExpenseRow = {
  id: number;
  category: string;
  amount_egp: string;
  notes_ar: string | null;
  photo_path: string | null;
  requires_approval: boolean;
  approved_by_user_id: number | null;
  approved_at: string | null;
  paid_from: 'cash' | 'bank' | 'instapay';
  // NULL on rows created before the الخزنة picker = cash drawer.
  cash_source: ExpenseCashSource | null;
  bank_account_id: number | null;
  shift_id: number | null;
  actor_user_id: number;
  actor_username: string | null;
  approved_by_username: string | null;
  bank_account_name_ar?: string | null;
  created_at: string;
};

type ExpenseSource = Pick<ExpenseRow, 'paid_from' | 'cash_source' | 'bank_account_id'>;

/**
 * Lock the الخزنة the expense is paid from and make sure it can cover the
 * amount. Runs inside the transaction so two concurrent expenses cannot both
 * pass against the same balance.
 */
async function assertSourceCovers(trx: Knex.Transaction, src: ExpenseSource, amount: number): Promise<void> {
  if (src.paid_from === 'cash') {
    if (src.cash_source === 'general_vault') {
      const vault = await trx('general_vault').where({ id: 1 }).forUpdate().first();
      if (!vault || Number(vault.current_balance_egp) < amount) throw new Error('INSUFFICIENT_VAULT_BALANCE');
    } else {
      const drawer = await trx('cash_drawer').where({ id: 1 }).forUpdate().first();
      if (!drawer || Number(drawer.current_balance_egp) < amount) throw new Error('INSUFFICIENT_CASH_BALANCE');
    }
    return;
  }
  if (!src.bank_account_id) throw new Error('INSTAPAY_REQUIRES_BANK_ACCOUNT');
  const account = await trx('bank_accounts').where({ id: src.bank_account_id }).forUpdate().first();
  if (!account) throw new Error('BANK_ACCOUNT_NOT_FOUND');
  if (Number(account.current_balance_egp) < amount) throw new Error('INSUFFICIENT_BANK_BALANCE');
}

/** Debit the expense's الخزنة: cash drawer, general vault, or the bank account. */
async function debitSource(trx: Knex.Transaction, expense: ExpenseRow, actorUserId: number): Promise<void> {
  const amount = Number(expense.amount_egp);
  if (expense.paid_from === 'cash') {
    if (expense.cash_source === 'general_vault') {
      await vaultRecordMovement(trx, 'out', 'adjustment', amount, actorUserId, 'expense', expense.id, expense.notes_ar ?? 'مصروف');
    } else {
      await cashRecordMovement(trx, 'out', 'expense', amount, actorUserId, 'expense', expense.id, expense.notes_ar, expense.shift_id);
    }
  } else if (expense.bank_account_id) {
    await bankRecordMovement(trx, expense.bank_account_id, 'out', 'other_out', amount, actorUserId, 'expense', expense.id, expense.notes_ar);
  }
}

export async function recordExpense(params: {
  category: string;
  amount: number;
  paidFrom: 'cash' | 'bank' | 'instapay';
  cashSource?: ExpenseCashSource | null;
  bankAccountId?: number | null;
  notesAr?: string | null;
  photoPath?: string | null;
  actorUserId: number;
  shiftId?: number | null;
}): Promise<ExpenseRow> {
  if ((params.paidFrom === 'bank' || params.paidFrom === 'instapay') && !params.bankAccountId) {
    throw new Error('INSTAPAY_REQUIRES_BANK_ACCOUNT');
  }
  const isCash = params.paidFrom === 'cash';
  const source: ExpenseSource = {
    paid_from: params.paidFrom,
    cash_source: isCash ? (params.cashSource ?? 'cash_drawer') : null,
    bank_account_id: isCash ? null : (params.bankAccountId ?? null),
  };

  const threshold = await getSetting<number>(undefined, 'approval_threshold_egp', 0);
  const requiresApproval = threshold > 0 && params.amount > threshold;

  return db.transaction(async (trx) => {
    await assertSourceCovers(trx, source, params.amount);

    const [{ id }] = await trx('expenses').insert({
      category: params.category,
      amount_egp: params.amount,
      notes_ar: params.notesAr ?? null,
      photo_path: params.photoPath ?? null,
      requires_approval: requiresApproval,
      paid_from: source.paid_from,
      cash_source: source.cash_source,
      bank_account_id: source.bank_account_id,
      actor_user_id: params.actorUserId,
      shift_id: params.shiftId ?? null,
    }).returning('id');
    const expense = await trx('expenses').where({ id }).first() as ExpenseRow;

    if (requiresApproval) {
      await notify({
        recipientRole: 'owner',
        severity: 'high',
        eventType: 'approval_needed',
        titleAr: 'طلب موافقة — مصروف',
        bodyAr: `طلب صرف ${params.amount.toFixed(2)} جنيه في فئة ${params.category}`,
        isBlocking: true,
        blockedActionPayload: { actionType: 'expense_high_value', expenseId: expense.id },
        payload: {
          expense_id: expense.id,
          amount_egp: params.amount,
          category: params.category,
          paid_from: params.paidFrom,
          cash_source: source.cash_source,
          requested_by_user_id: params.actorUserId,
        },
      });
    } else {
      await debitSource(trx, expense, params.actorUserId);
    }

    await auditFromService(trx, {
      actorUserId: params.actorUserId,
      action: 'expense_recorded',
      entity: 'expense',
      entityId: expense.id,
      after: {
        category: params.category,
        amount_egp: params.amount,
        paid_from: source.paid_from,
        cash_source: source.cash_source,
        bank_account_id: source.bank_account_id,
        requires_approval: requiresApproval,
      },
      severity: 'medium',
    });

    return expense;
  });
}

export async function approveExpense(expenseId: number, actorUserId: number): Promise<ExpenseRow> {
  return db.transaction(async (trx) => {
    const expense = await trx('expenses').where({ id: expenseId }).forUpdate().first() as ExpenseRow | undefined;
    if (!expense) throw new Error('EXPENSE_NOT_FOUND');
    if (!expense.requires_approval) throw new Error('EXPENSE_NOT_PENDING_APPROVAL');
    if (expense.approved_at !== null) throw new Error('EXPENSE_ALREADY_APPROVED');

    // Amount wasn't deducted when created — check the chosen الخزنة again now.
    await assertSourceCovers(trx, expense, Number(expense.amount_egp));

    await trx('expenses').where({ id: expenseId }).update({ approved_by_user_id: actorUserId, approved_at: trx.fn.now() });
    const upd = await trx('expenses').where({ id: expenseId }).first() as ExpenseRow;

    await debitSource(trx, upd, actorUserId);

    await auditFromService(trx, {
      actorUserId,
      action: 'expense_approved',
      entity: 'expense',
      entityId: expenseId,
      before: { approved_at: null },
      after: { approved_by_user_id: actorUserId, approved_at: 'now', paid_from: upd.paid_from, cash_source: upd.cash_source },
      severity: 'medium',
    });

    return upd;
  });
}

export async function rejectExpense(expenseId: number, reasonAr: string, actorUserId: number): Promise<ExpenseRow> {
  return db.transaction(async (trx) => {
    const expense = await trx('expenses').where({ id: expenseId }).forUpdate().first();
    if (!expense) throw new Error('EXPENSE_NOT_FOUND');
    if (!expense.requires_approval) throw new Error('EXPENSE_NOT_PENDING_APPROVAL');
    if (expense.approved_at !== null) throw new Error('EXPENSE_ALREADY_PROCESSED');

    await trx('expenses').where({ id: expenseId }).update({
      requires_approval: false,
      notes_ar: expense.notes_ar ? `${expense.notes_ar} | مرفوض: ${reasonAr}` : `مرفوض: ${reasonAr}`,
    });
    const updated = await trx('expenses').where({ id: expenseId }).first() as ExpenseRow;

    await auditFromService(trx, {
      actorUserId,
      action: 'expense_rejected',
      entity: 'expense',
      entityId: expenseId,
      after: { reason_ar: reasonAr },
      severity: 'medium',
    });

    return updated;
  });
}

export async function listExpenses(params: {
  category?: string;
  paidFrom?: 'cash' | 'bank' | 'instapay';
  status?: 'pending' | 'approved' | 'all';
  from?: string;
  to?: string;
  search?: string;
  page: number;
  limit: number;
}): Promise<{ rows: ExpenseRow[]; total: number }> {
  const offset = (params.page - 1) * params.limit;
  const base = db('expenses as e')
    .leftJoin('users as u', 'e.actor_user_id', 'u.id')
    .leftJoin('users as ab', 'e.approved_by_user_id', 'ab.id')
    .leftJoin('bank_accounts as ba', 'e.bank_account_id', 'ba.id')
    .select('e.*', 'u.username as actor_username', 'ab.username as approved_by_username', 'ba.name_ar as bank_account_name_ar');

  if (params.category) base.where('e.category', params.category);
  if (params.paidFrom) base.where('e.paid_from', params.paidFrom);
  if (params.from) base.where('e.created_at', '>=', params.from);
  if (params.to) base.where('e.created_at', '<=', params.to);
  if (params.status === 'pending') base.where('e.requires_approval', true).whereNull('e.approved_at');
  else if (params.status === 'approved') base.whereNotNull('e.approved_at');
  if (params.search) {
    // Notes + actor only. `category` holds English slugs (rent, salary, …)
    // whose Arabic labels live in the frontend, so ILIKE-ing it would only
    // ever match if the user typed English into an Arabic-only UI.
    const term = `%${params.search}%`;
    base.where((b) => {
      b.whereILike('e.notes_ar', term).orWhereILike('u.username', term);
    });
  }

  const [countRow] = await base.clone().clearSelect().count<Array<{ count: string }>>('e.id as count');
  const rows = await base.orderBy('e.created_at', 'desc').limit(params.limit).offset(offset);

  return { rows: rows as ExpenseRow[], total: Number((countRow as { count: string }).count) };
}
