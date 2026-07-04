import type { Knex } from 'knex';
import { db } from '../../db/connection.js';

export type GeneralVaultEventType = 'vault_transfer_in' | 'vault_transfer_out' | 'adjustment';

export type GeneralVaultRow = {
  id: number;
  current_balance_egp: string;
  last_movement_at: string | null;
};

export async function getBalance(): Promise<{
  current_balance_egp: number;
  last_movement_at: string | null;
}> {
  const row = (await db('general_vault').where({ id: 1 }).first()) as GeneralVaultRow;
  return {
    current_balance_egp: Number(row.current_balance_egp),
    last_movement_at: row.last_movement_at,
  };
}

export async function recordMovement(
  trx: Knex.Transaction,
  direction: 'in' | 'out',
  eventType: GeneralVaultEventType,
  amount: number,
  actorUserId: number,
  refType?: string | null,
  refId?: number | null,
  notesAr?: string | null,
): Promise<number> {
  const row = (await trx('general_vault').where({ id: 1 }).forUpdate().first()) as GeneralVaultRow;
  const current = Number(row.current_balance_egp);
  const newBalance = direction === 'in' ? current + amount : current - amount;

  await trx('general_vault').where({ id: 1 }).update({
    current_balance_egp: newBalance,
    last_movement_at: trx.fn.now(),
  });

  const [{ id: movementId }] = await trx('general_vault_movements').insert({
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

export type GeneralVaultMovementRow = {
  id: number;
  direction: 'in' | 'out';
  event_type: GeneralVaultEventType;
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
}): Promise<{ rows: GeneralVaultMovementRow[]; total: number }> {
  const offset = (params.page - 1) * params.limit;
  const base = db('general_vault_movements as gvm')
    .leftJoin('users as u', 'gvm.actor_user_id', 'u.id')
    .select('gvm.*', 'u.username as actor_username');

  if (params.from) base.where('gvm.created_at', '>=', params.from);
  if (params.to) base.where('gvm.created_at', '<=', params.to);

  const [countRow] = await base.clone().clearSelect().count<Array<{ count: string }>>('gvm.id as count');
  const rows = await base.orderBy('gvm.created_at', 'desc').limit(params.limit).offset(offset);

  return {
    rows: rows as GeneralVaultMovementRow[],
    total: Number((countRow as { count: string }).count),
  };
}
