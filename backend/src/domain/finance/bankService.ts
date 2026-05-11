import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import { auditFromService } from '../inventory/audit.helper.js';
import { notify } from '../notifications/notificationsService.js';

export type BankEventType =
  | 'instapay_payment'
  | 'cash_deposit'
  | 'refund'
  | 'reconciliation_adjustment'
  | 'opening_balance_set'
  | 'other_in'
  | 'other_out';

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

export type BankMovementRow = {
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

export async function listBankAccounts(onlyActive?: boolean): Promise<BankAccount[]> {
  const q = db('bank_accounts').orderBy('is_default', 'desc').orderBy('name_ar');
  if (onlyActive) q.where({ is_active: true });
  return (await q) as BankAccount[];
}

export async function getBankAccount(id: number): Promise<BankAccount | undefined> {
  return (await db('bank_accounts').where({ id }).first()) as BankAccount | undefined;
}

export async function createBankAccount(
  data: {
    nameAr: string;
    bankNameAr?: string | null;
    branchAr?: string | null;
    iban?: string | null;
    accountNumber?: string | null;
    notesAr?: string | null;
    isDefault?: boolean;
  },
  actorUserId: number,
): Promise<BankAccount> {
  return db.transaction(async (trx) => {
    if (data.isDefault) {
      await trx('bank_accounts').update({ is_default: false });
    }

    const [{ id }] = await trx('bank_accounts').insert({
      name_ar: data.nameAr,
      bank_name_ar: data.bankNameAr ?? null,
      branch_ar: data.branchAr ?? null,
      iban: data.iban ?? null,
      account_number: data.accountNumber ?? null,
      notes_ar: data.notesAr ?? null,
      is_active: true,
      is_default: data.isDefault ?? false,
      current_balance_egp: 0,
    }).returning('id');
    const row = await trx('bank_accounts').where({ id }).first();

    await auditFromService(trx, {
      actorUserId,
      action: 'bank_account_created',
      entity: 'bank_account',
      entityId: (row as BankAccount).id,
      after: row,
      severity: 'medium',
    });

    return row as BankAccount;
  });
}

export async function updateBankAccount(
  id: number,
  data: {
    nameAr?: string;
    bankNameAr?: string | null;
    branchAr?: string | null;
    iban?: string | null;
    accountNumber?: string | null;
    notesAr?: string | null;
    isActive?: boolean;
    isDefault?: boolean;
  },
  actorUserId: number,
): Promise<BankAccount> {
  return db.transaction(async (trx) => {
    const before = await trx('bank_accounts').where({ id }).first();
    if (!before) throw new Error('BANK_ACCOUNT_NOT_FOUND');

    if (data.isDefault) {
      await trx('bank_accounts').whereNot({ id }).update({ is_default: false });
    }

    const updates: Record<string, unknown> = {};
    if (data.nameAr !== undefined) updates.name_ar = data.nameAr;
    if (data.bankNameAr !== undefined) updates.bank_name_ar = data.bankNameAr;
    if (data.branchAr !== undefined) updates.branch_ar = data.branchAr;
    if (data.iban !== undefined) updates.iban = data.iban;
    if (data.accountNumber !== undefined) updates.account_number = data.accountNumber;
    if (data.notesAr !== undefined) updates.notes_ar = data.notesAr;
    if (data.isActive !== undefined) updates.is_active = data.isActive;
    if (data.isDefault !== undefined) updates.is_default = data.isDefault;

    await trx('bank_accounts').where({ id }).update(updates);
    const row = await trx('bank_accounts').where({ id }).first();

    await auditFromService(trx, {
      actorUserId,
      action: 'bank_account_updated',
      entity: 'bank_account',
      entityId: id,
      before,
      after: row,
      severity: 'medium',
    });

    return row as BankAccount;
  });
}

export async function recordMovement(
  trx: Knex.Transaction,
  bankAccountId: number,
  direction: 'in' | 'out',
  eventType: BankEventType,
  amount: number,
  actorUserId: number,
  refType?: string | null,
  refId?: number | null,
  notesAr?: string | null,
): Promise<number> {
  const account = await trx('bank_accounts').where({ id: bankAccountId }).forUpdate().first();
  if (!account) throw new Error('BANK_ACCOUNT_NOT_FOUND');

  const current = Number(account.current_balance_egp);
  const newBalance = direction === 'in' ? current + amount : current - amount;

  await trx('bank_accounts').where({ id: bankAccountId }).update({
    current_balance_egp: newBalance,
    updated_at: trx.fn.now(),
  });

  const [{ id: movementId }] = await trx('bank_movements').insert({
    bank_account_id: bankAccountId,
    direction,
    event_type: eventType,
    amount_egp: amount,
    reference_type: refType ?? null,
    reference_id: refId ?? null,
    balance_after_egp: newBalance,
    notes_ar: notesAr ?? null,
    actor_user_id: actorUserId,
  }).returning('id');

  return Number(movementId);
}

export async function recordReconciliation(params: {
  date: string;
  bankAccountId: number;
  actualBalance: number;
  notesAr?: string | null;
  actorUserId: number;
}): Promise<{ id: number; variance_egp: number }> {
  const account = await db('bank_accounts').where({ id: params.bankAccountId }).first();
  if (!account) throw new Error('BANK_ACCOUNT_NOT_FOUND');

  const expected = Number(account.current_balance_egp);
  const variance = Math.round((params.actualBalance - expected) * 100) / 100;

  return db.transaction(async (trx) => {
    const [{ id }] = await trx('reconciliations').insert({
      recon_date: params.date,
      type: 'bank',
      bank_account_id: params.bankAccountId,
      expected_balance_egp: expected,
      actual_balance_egp: params.actualBalance,
      variance_egp: variance,
      notes_ar: params.notesAr ?? null,
      actor_user_id: params.actorUserId,
    }).returning('id');

    if (Math.abs(variance) > 0.001) {
      await notify({
        recipientRole: 'owner',
        severity: 'high',
        eventType: 'cash_discrepancy',
        titleAr: 'فارق في الحساب البنكي',
        bodyAr: `تم رصد فارق ${Math.abs(variance).toFixed(2)} جنيه في تسوية بنك ${account.name_ar} يوم ${params.date}`,
        payload: {
          date: params.date,
          bank_account_id: params.bankAccountId,
          bank_name_ar: account.name_ar,
          expected_balance_egp: expected,
          actual_balance_egp: params.actualBalance,
          variance_egp: variance,
        },
      });
    }

    return { id: id as number, variance_egp: variance };
  });
}

export async function listMovements(
  bankAccountId: number,
  params: { from?: string; to?: string; page: number; limit: number },
): Promise<{ rows: BankMovementRow[]; total: number }> {
  const offset = (params.page - 1) * params.limit;
  const base = db('bank_movements as bm')
    .where('bm.bank_account_id', bankAccountId)
    .leftJoin('users as u', 'bm.actor_user_id', 'u.id')
    .select('bm.*', 'u.username as actor_username');

  if (params.from) base.where('bm.created_at', '>=', params.from);
  if (params.to) base.where('bm.created_at', '<=', params.to);

  const [countRow] = await base.clone().clearSelect().count<Array<{ count: string }>>('bm.id as count');
  const rows = await base.orderBy('bm.created_at', 'desc').limit(params.limit).offset(offset);

  return {
    rows: rows as BankMovementRow[],
    total: Number((countRow as { count: string }).count),
  };
}
