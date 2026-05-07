import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import { notify } from '../notifications/notificationsService.js';

export type CashEventType =
  | 'sale_payment'
  | 'deposit_payment'
  | 'refund'
  | 'expense'
  | 'cash_to_bank'
  | 'owner_withdrawal'
  | 'opening_balance_set'
  | 'reconciliation_adjustment';

export type CashDrawerRow = {
  id: number;
  current_balance_egp: string;
  opening_balance_egp: string;
  opening_set_at: string | null;
  last_movement_at: string | null;
};

export async function getBalance(): Promise<{
  current_balance_egp: number;
  opening_balance_egp: number;
  opening_set_at: string | null;
  last_movement_at: string | null;
}> {
  const row = (await db('cash_drawer').where({ id: 1 }).first()) as CashDrawerRow;
  return {
    current_balance_egp: Number(row.current_balance_egp),
    opening_balance_egp: Number(row.opening_balance_egp),
    opening_set_at: row.opening_set_at,
    last_movement_at: row.last_movement_at,
  };
}

export async function setOpeningBalance(
  amount: number,
  actorUserId: number,
  override = false,
): Promise<void> {
  await db.transaction(async (trx) => {
    const row = (await trx('cash_drawer').where({ id: 1 }).forUpdate().first()) as CashDrawerRow;
    if (row.opening_set_at !== null && !override) {
      throw new Error('OPENING_BALANCE_ALREADY_SET');
    }
    await trx('cash_drawer').where({ id: 1 }).update({
      current_balance_egp: amount,
      opening_balance_egp: amount,
      opening_set_at: trx.fn.now(),
      last_movement_at: trx.fn.now(),
    });
    await trx('cash_movements').insert({
      direction: 'in',
      event_type: 'opening_balance_set',
      amount_egp: amount,
      balance_after_egp: amount,
      notes_ar: 'تعيين الرصيد الافتتاحي',
      actor_user_id: actorUserId,
    });
  });
}

export async function recordMovement(
  trx: Knex.Transaction,
  direction: 'in' | 'out',
  eventType: CashEventType,
  amount: number,
  actorUserId: number,
  refType?: string | null,
  refId?: number | null,
  notesAr?: string | null,
): Promise<number> {
  const row = (await trx('cash_drawer').where({ id: 1 }).forUpdate().first()) as CashDrawerRow;
  const current = Number(row.current_balance_egp);
  const newBalance = direction === 'in' ? current + amount : current - amount;

  await trx('cash_drawer').where({ id: 1 }).update({
    current_balance_egp: newBalance,
    last_movement_at: trx.fn.now(),
  });

  const [movement] = await trx('cash_movements')
    .insert({
      direction,
      event_type: eventType,
      amount_egp: amount,
      reference_type: refType ?? null,
      reference_id: refId ?? null,
      balance_after_egp: newBalance,
      notes_ar: notesAr ?? null,
      actor_user_id: actorUserId,
    })
    .returning('id');

  return (movement as { id: number }).id;
}

export async function dailyExpected(date: string): Promise<number> {
  const lastMovement = await db('cash_movements')
    .where(db.raw(`DATE(created_at AT TIME ZONE 'Africa/Cairo') <= ?`, [date]))
    .orderBy('created_at', 'desc')
    .first();

  if (lastMovement) {
    return Number(lastMovement.balance_after_egp);
  }
  const drawer = (await db('cash_drawer').where({ id: 1 }).first()) as CashDrawerRow;
  return Number(drawer.current_balance_egp);
}

export async function recordReconciliation(params: {
  date: string;
  actualBalance: number;
  notesAr?: string | null;
  actorUserId: number;
}): Promise<{ id: number; variance_egp: number }> {
  const expected = await dailyExpected(params.date);
  const variance = Math.round((params.actualBalance - expected) * 100) / 100;

  return db.transaction(async (trx) => {
    const [row] = await trx('reconciliations')
      .insert({
        recon_date: params.date,
        type: 'cash',
        bank_account_id: null,
        expected_balance_egp: expected,
        actual_balance_egp: params.actualBalance,
        variance_egp: variance,
        notes_ar: params.notesAr ?? null,
        actor_user_id: params.actorUserId,
      })
      .returning('id');

    if (Math.abs(variance) > 0.001) {
      await notify({
        recipientRole: 'owner',
        severity: 'high',
        eventType: 'cash_discrepancy',
        titleAr: 'فارق في الخزنة النقدية',
        bodyAr: `تم رصد فارق ${Math.abs(variance).toFixed(2)} جنيه في تسوية يوم ${params.date}`,
        payload: {
          date: params.date,
          expected_balance_egp: expected,
          actual_balance_egp: params.actualBalance,
          variance_egp: variance,
        },
      });
    }

    return { id: (row as { id: number }).id, variance_egp: variance };
  });
}

export type CashMovementRow = {
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

export async function listMovements(params: {
  from?: string;
  to?: string;
  page: number;
  limit: number;
}): Promise<{ rows: CashMovementRow[]; total: number }> {
  const offset = (params.page - 1) * params.limit;
  const base = db('cash_movements as cm')
    .leftJoin('users as u', 'cm.actor_user_id', 'u.id')
    .select('cm.*', 'u.username as actor_username');

  if (params.from) base.where('cm.created_at', '>=', params.from);
  if (params.to) base.where('cm.created_at', '<=', params.to);

  const [countRow] = await base.clone().clearSelect().count<Array<{ count: string }>>('cm.id as count');
  const rows = await base.orderBy('cm.created_at', 'desc').limit(params.limit).offset(offset);

  return {
    rows: rows as CashMovementRow[],
    total: Number((countRow as { count: string }).count),
  };
}
