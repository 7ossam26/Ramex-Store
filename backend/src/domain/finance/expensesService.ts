import { db } from '../../db/connection.js';
import { auditFromService } from '../inventory/audit.helper.js';
import { notify } from '../notifications/notificationsService.js';
import { getSetting } from '../settings/settings.service.js';
import { recordMovement as cashRecordMovement, getBalance as getCashBalance } from './cashDrawerService.js';
import { recordMovement as bankRecordMovement, getBankAccount } from './bankService.js';

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
  bank_account_id: number | null;
  actor_user_id: number;
  actor_username: string | null;
  approved_by_username: string | null;
  created_at: string;
};

export async function recordExpense(params: {
  category: string;
  amount: number;
  paidFrom: 'cash' | 'bank' | 'instapay';
  bankAccountId?: number | null;
  notesAr?: string | null;
  photoPath?: string | null;
  actorUserId: number;
  shiftId?: number | null;
}): Promise<ExpenseRow> {
  if ((params.paidFrom === 'bank' || params.paidFrom === 'instapay') && !params.bankAccountId) {
    throw new Error('INSTAPAY_REQUIRES_BANK_ACCOUNT');
  }

  // Check balance before recording
  if (params.paidFrom === 'cash') {
    const cashBalance = await getCashBalance();
    if (cashBalance.current_balance_egp < params.amount) {
      throw new Error('INSUFFICIENT_CASH_BALANCE');
    }
  } else if ((params.paidFrom === 'bank' || params.paidFrom === 'instapay') && params.bankAccountId) {
    const bankAccount = await getBankAccount(params.bankAccountId);
    if (!bankAccount) throw new Error('BANK_ACCOUNT_NOT_FOUND');
    if (Number(bankAccount.current_balance_egp) < params.amount) {
      throw new Error('INSUFFICIENT_BANK_BALANCE');
    }
  }

  const threshold = await getSetting<number>(undefined, 'approval_threshold_egp', 0);
  const requiresApproval = threshold > 0 && params.amount > threshold;

  return db.transaction(async (trx) => {
    const [{ id }] = await trx('expenses').insert({
      category: params.category,
      amount_egp: params.amount,
      notes_ar: params.notesAr ?? null,
      photo_path: params.photoPath ?? null,
      requires_approval: requiresApproval,
      paid_from: params.paidFrom,
      bank_account_id: params.bankAccountId ?? null,
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
          requested_by_user_id: params.actorUserId,
        },
      });
    } else {
      if (params.paidFrom === 'cash') {
        await cashRecordMovement(trx, 'out', 'expense', params.amount, params.actorUserId, 'expense', expense.id, params.notesAr);
      } else if ((params.paidFrom === 'bank' || params.paidFrom === 'instapay') && params.bankAccountId) {
        await bankRecordMovement(trx, params.bankAccountId, 'out', 'other_out', params.amount, params.actorUserId, 'expense', expense.id, params.notesAr);
      }
    }

    await auditFromService(trx, {
      actorUserId: params.actorUserId,
      action: 'expense_recorded',
      entity: 'expense',
      entityId: expense.id,
      after: { category: params.category, amount_egp: params.amount, paid_from: params.paidFrom, requires_approval: requiresApproval },
      severity: 'medium',
    });

    return expense;
  });
}

export async function approveExpense(expenseId: number, actorUserId: number): Promise<ExpenseRow> {
  return db.transaction(async (trx) => {
    const expense = await trx('expenses').where({ id: expenseId }).forUpdate().first();
    if (!expense) throw new Error('EXPENSE_NOT_FOUND');
    if (!expense.requires_approval) throw new Error('EXPENSE_NOT_PENDING_APPROVAL');
    if (expense.approved_at !== null) throw new Error('EXPENSE_ALREADY_APPROVED');

    // Check balance before approval (since amount wasn't deducted when created)
    const amount = Number(expense.amount_egp);
    if (expense.paid_from === 'cash') {
      const cashBalance = await getCashBalance();
      if (cashBalance.current_balance_egp < amount) {
        throw new Error('INSUFFICIENT_CASH_BALANCE');
      }
    } else if ((expense.paid_from === 'bank' || expense.paid_from === 'instapay') && expense.bank_account_id) {
      const bankAccount = await getBankAccount(expense.bank_account_id);
      if (!bankAccount) throw new Error('BANK_ACCOUNT_NOT_FOUND');
      if (Number(bankAccount.current_balance_egp) < amount) {
        throw new Error('INSUFFICIENT_BANK_BALANCE');
      }
    }

    await trx('expenses').where({ id: expenseId }).update({ approved_by_user_id: actorUserId, approved_at: trx.fn.now() });
    const upd = await trx('expenses').where({ id: expenseId }).first() as ExpenseRow;

    if (upd.paid_from === 'cash') {
      await cashRecordMovement(trx, 'out', 'expense', Number(upd.amount_egp), actorUserId, 'expense', expenseId, upd.notes_ar);
    } else if ((upd.paid_from === 'bank' || upd.paid_from === 'instapay') && upd.bank_account_id) {
      await bankRecordMovement(trx, upd.bank_account_id, 'out', 'other_out', Number(upd.amount_egp), actorUserId, 'expense', expenseId, upd.notes_ar);
    }

    await auditFromService(trx, {
      actorUserId,
      action: 'expense_approved',
      entity: 'expense',
      entityId: expenseId,
      before: { approved_at: null },
      after: { approved_by_user_id: actorUserId, approved_at: 'now' },
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
    .select('e.*', 'u.username as actor_username', 'ab.username as approved_by_username');

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
