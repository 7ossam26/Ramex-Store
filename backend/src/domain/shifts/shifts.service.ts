import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import { auditFromService } from '../inventory/audit.helper.js';

export type ShiftStatus = 'open' | 'closed';

export type Shift = {
  id: number;
  opened_at: string;
  opened_by_user_id: number;
  opened_by_username: string | null;
  closed_at: string | null;
  closed_by_user_id: number | null;
  closed_by_username: string | null;
  opening_cash_balance_egp: string;
  closing_cash_balance_egp: string | null;
  status: ShiftStatus;
  notes_ar: string | null;
  created_at: string;
};

const SHIFT_COLS = [
  's.id',
  's.opened_at',
  's.opened_by_user_id',
  'uo.username as opened_by_username',
  's.closed_at',
  's.closed_by_user_id',
  'uc.username as closed_by_username',
  's.opening_cash_balance_egp',
  's.closing_cash_balance_egp',
  's.status',
  's.notes_ar',
  's.created_at',
];

function shiftQuery() {
  return db('shifts as s')
    .leftJoin('users as uo', 's.opened_by_user_id', 'uo.id')
    .leftJoin('users as uc', 's.closed_by_user_id', 'uc.id')
    .select(SHIFT_COLS);
}

export async function getCurrentShift(): Promise<Shift | null> {
  const row = await shiftQuery().where('s.status', 'open').first();
  return (row as Shift) ?? null;
}

export async function getCurrentShiftId(trx?: Knex.Transaction): Promise<number | null> {
  const q = (trx ?? db)('shifts').where('status', 'open').select('id').first();
  const row = await q;
  return row ? Number(row.id) : null;
}

export async function openShift(actorUserId: number, notesAr?: string | null): Promise<Shift> {
  return db.transaction(async (trx) => {
    // Lock any existing open shift to prevent races
    const existing = await trx('shifts')
      .where('status', 'open')
      .forUpdate()
      .first();

    if (existing) {
      throw new Error('STALE_OPEN_SHIFT');
    }

    // Opening balance is always 0 — daily reset model
    const [{ id: shiftId }] = await trx('shifts').insert({
      opened_by_user_id: actorUserId,
      opening_cash_balance_egp: 0,
      status: 'open',
      notes_ar: notesAr ?? null,
    }).returning('id');

    // Reset the cash drawer to 0 — record the zeroing movement if balance > 0
    const drawer = await trx('cash_drawer').where({ id: 1 }).forUpdate().first();
    const currentBalance = Number(drawer?.current_balance_egp ?? 0);

    if (currentBalance !== 0) {
      const direction = currentBalance > 0 ? 'out' : 'in';
      const amount = Math.abs(currentBalance);
      await trx('cash_drawer').where({ id: 1 }).update({
        current_balance_egp: 0,
        last_movement_at: trx.fn.now(),
      });
      await trx('cash_movements').insert({
        direction,
        event_type: 'shift_open',
        amount_egp: amount,
        balance_after_egp: 0,
        notes_ar: 'إعادة تصفير الخزنة عند بداية الوردية',
        actor_user_id: actorUserId,
        shift_id: shiftId,
      });
    }

    await auditFromService(trx, {
      actorUserId,
      action: 'shift_opened',
      entity: 'shifts',
      entityId: shiftId,
      after: { status: 'open', opening_cash_balance_egp: 0 },
      severity: 'low',
    });

    const shift = await trx('shifts as s')
      .leftJoin('users as uo', 's.opened_by_user_id', 'uo.id')
      .leftJoin('users as uc', 's.closed_by_user_id', 'uc.id')
      .select(SHIFT_COLS)
      .where('s.id', shiftId)
      .first();

    return shift as Shift;
  });
}

export async function closeShift(actorUserId: number, notesAr?: string | null): Promise<Shift> {
  return db.transaction(async (trx) => {
    const openShift = await trx('shifts')
      .where('status', 'open')
      .forUpdate()
      .first();

    if (!openShift) {
      throw new Error('NO_OPEN_SHIFT');
    }

    const shiftId = Number(openShift.id);

    // Snapshot current drawer balance
    const drawer = await trx('cash_drawer').where({ id: 1 }).forUpdate().first();
    const closingBalance = Number(drawer?.current_balance_egp ?? 0);

    // Reset drawer to 0
    if (closingBalance !== 0) {
      const direction = closingBalance > 0 ? 'out' : 'in';
      const amount = Math.abs(closingBalance);
      await trx('cash_drawer').where({ id: 1 }).update({
        current_balance_egp: 0,
        last_movement_at: trx.fn.now(),
      });
      await trx('cash_movements').insert({
        direction,
        event_type: 'shift_close',
        amount_egp: amount,
        balance_after_egp: 0,
        notes_ar: 'إعادة تصفير الخزنة عند نهاية الوردية',
        actor_user_id: actorUserId,
        shift_id: shiftId,
      });
    }

    await trx('shifts').where({ id: shiftId }).update({
      closed_at: trx.fn.now(),
      closed_by_user_id: actorUserId,
      closing_cash_balance_egp: closingBalance,
      status: 'closed',
      notes_ar: notesAr ?? openShift.notes_ar,
      updated_at: trx.fn.now(),
    });

    await auditFromService(trx, {
      actorUserId,
      action: 'shift_closed',
      entity: 'shifts',
      entityId: shiftId,
      before: { status: 'open' },
      after: { status: 'closed', closing_cash_balance_egp: closingBalance },
      severity: 'medium',
    });

    const shift = await trx('shifts as s')
      .leftJoin('users as uo', 's.opened_by_user_id', 'uo.id')
      .leftJoin('users as uc', 's.closed_by_user_id', 'uc.id')
      .select(SHIFT_COLS)
      .where('s.id', shiftId)
      .first();

    return shift as Shift;
  });
}

export async function listShifts(params: {
  from?: string;
  to?: string;
  page: number;
  limit: number;
}): Promise<{ rows: Shift[]; total: number }> {
  const offset = (params.page - 1) * params.limit;
  const base = shiftQuery();

  if (params.from) base.where('s.opened_at', '>=', params.from);
  if (params.to) base.where('s.opened_at', '<=', params.to);

  const [countRow] = await base
    .clone()
    .clearSelect()
    .count<Array<{ count: string }>>('s.id as count');
  const rows = await base
    .orderBy('s.opened_at', 'desc')
    .limit(params.limit)
    .offset(offset);

  return {
    rows: rows as Shift[],
    total: Number((countRow as { count: string }).count),
  };
}
