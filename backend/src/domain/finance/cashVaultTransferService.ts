import { db } from '../../db/connection.js';
import { auditFromService } from '../inventory/audit.helper.js';
import { recordMovement as cashRecordMovement, getBalance as getCashBalance } from './cashDrawerService.js';
import { recordMovement as generalVaultRecordMovement } from './generalVaultService.js';

export type CashVaultTransferStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';

export type CashVaultTransferRow = {
  id: number;
  amount_egp: string;
  status: CashVaultTransferStatus;
  notes_ar: string | null;
  reject_reason_ar: string | null;
  created_by_user_id: number;
  created_at: string;
  reviewed_by_user_id: number | null;
  reviewed_at: string | null;
  cash_movement_id: number | null;
  general_vault_movement_id: number | null;
  created_by_username: string | null;
  reviewed_by_username: string | null;
};

export async function createTransfer(params: {
  amount: number;
  notesAr?: string | null;
  actorUserId: number;
}): Promise<CashVaultTransferRow> {
  const cashBalance = await getCashBalance();
  if (cashBalance.current_balance_egp < params.amount) {
    throw new Error('INSUFFICIENT_CASH_BALANCE');
  }

  return db.transaction(async (trx) => {
    const [{ id }] = await trx('cash_vault_transfers').insert({
      amount_egp: params.amount,
      status: 'pending',
      notes_ar: params.notesAr ?? null,
      created_by_user_id: params.actorUserId,
    }).returning('id');

    await auditFromService(trx, {
      actorUserId: params.actorUserId,
      action: 'cash_vault_transfer_created',
      entity: 'cash_vault_transfer',
      entityId: id,
      after: { amount_egp: params.amount },
      severity: 'medium',
    });

    return getTransfer(id, trx);
  });
}

export async function getTransfer(
  id: number,
  trx: typeof db | import('knex').Knex.Transaction = db,
): Promise<CashVaultTransferRow> {
  const row = await trx('cash_vault_transfers as t')
    .leftJoin('users as cu', 't.created_by_user_id', 'cu.id')
    .leftJoin('users as ru', 't.reviewed_by_user_id', 'ru.id')
    .select('t.*', 'cu.username as created_by_username', 'ru.username as reviewed_by_username')
    .where('t.id', id)
    .first();
  if (!row) throw new Error('TRANSFER_NOT_FOUND');
  return row as CashVaultTransferRow;
}

export async function listTransfers(params: {
  status?: CashVaultTransferStatus | 'all';
  from?: string;
  to?: string;
  page: number;
  limit: number;
}): Promise<{ rows: CashVaultTransferRow[]; total: number }> {
  const offset = (params.page - 1) * params.limit;
  const base = db('cash_vault_transfers as t')
    .leftJoin('users as cu', 't.created_by_user_id', 'cu.id')
    .leftJoin('users as ru', 't.reviewed_by_user_id', 'ru.id')
    .select('t.*', 'cu.username as created_by_username', 'ru.username as reviewed_by_username');

  if (params.status && params.status !== 'all') base.where('t.status', params.status);
  if (params.from) base.where('t.created_at', '>=', params.from);
  if (params.to) base.where('t.created_at', '<=', params.to);

  const [countRow] = await base.clone().clearSelect().count<Array<{ count: string }>>('t.id as count');
  const rows = await base.orderBy('t.created_at', 'desc').limit(params.limit).offset(offset);

  return {
    rows: rows as CashVaultTransferRow[],
    total: Number((countRow as { count: string }).count),
  };
}

export async function confirmTransfer(id: number, actorUserId: number): Promise<CashVaultTransferRow> {
  return db.transaction(async (trx) => {
    const transfer = await trx('cash_vault_transfers').where({ id }).forUpdate().first();
    if (!transfer) throw new Error('TRANSFER_NOT_FOUND');
    if (transfer.status !== 'pending') throw new Error('TRANSFER_NOT_PENDING');

    const amount = Number(transfer.amount_egp);
    const cashMovId = await cashRecordMovement(
      trx, 'out', 'vault_transfer_out', amount, actorUserId,
      'cash_vault_transfer', id, transfer.notes_ar,
    );
    const gvMovId = await generalVaultRecordMovement(
      trx, 'in', 'vault_transfer_in', amount, actorUserId,
      'cash_vault_transfer', id, transfer.notes_ar,
    );

    await trx('cash_vault_transfers').where({ id }).update({
      status: 'confirmed',
      reviewed_by_user_id: actorUserId,
      reviewed_at: trx.fn.now(),
      cash_movement_id: cashMovId,
      general_vault_movement_id: gvMovId,
    });

    await auditFromService(trx, {
      actorUserId,
      action: 'cash_vault_transfer_confirmed',
      entity: 'cash_vault_transfer',
      entityId: id,
      before: { status: 'pending' },
      after: { status: 'confirmed', amount_egp: amount },
      severity: 'high',
    });

    return getTransfer(id, trx);
  });
}

export async function rejectTransfer(
  id: number,
  reasonAr: string,
  actorUserId: number,
): Promise<CashVaultTransferRow> {
  return db.transaction(async (trx) => {
    const transfer = await trx('cash_vault_transfers').where({ id }).forUpdate().first();
    if (!transfer) throw new Error('TRANSFER_NOT_FOUND');
    if (transfer.status !== 'pending') throw new Error('TRANSFER_NOT_PENDING');

    await trx('cash_vault_transfers').where({ id }).update({
      status: 'rejected',
      reject_reason_ar: reasonAr,
      reviewed_by_user_id: actorUserId,
      reviewed_at: trx.fn.now(),
    });

    await auditFromService(trx, {
      actorUserId,
      action: 'cash_vault_transfer_rejected',
      entity: 'cash_vault_transfer',
      entityId: id,
      before: { status: 'pending' },
      after: { status: 'rejected', reject_reason_ar: reasonAr },
      severity: 'medium',
    });

    return getTransfer(id, trx);
  });
}
