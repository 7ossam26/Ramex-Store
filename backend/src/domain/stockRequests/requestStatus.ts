import type { Knex } from 'knex';

/**
 * Shared helpers for the stock-request module. Kept free of any import from the
 * shipments service so shipments.service.ts can use them without a cycle.
 *
 * LOCK ORDER (everywhere, including the rolls trigger in migration 104):
 *   roll  ->  request item  ->  request
 * The request row is only ever locked LAST (inside lockRequestLast), so a sale /
 * damage / pack / mark-unavailable running in parallel can never deadlock on it.
 */

export type RequestStatus = 'open' | 'in_progress' | 'awaiting_review' | 'completed' | 'cancelled';
export type ItemStatus = 'requested' | 'packing' | 'dispatched' | 'unavailable' | 'cancelled';

export const ACTIVE_ITEM_STATUSES: ItemStatus[] = ['requested', 'packing'];

export type ItemEventInput = {
  itemId: number;
  requestId: number;
  eventType: string;
  fromStatus?: ItemStatus | null;
  toStatus?: ItemStatus | null;
  actorUserId?: number | null;
  noteAr?: string | null;
  shipmentId?: number | null;
  shipmentLineId?: number | null;
};

/** Append one row to the (append-only) per-item history. */
export async function logItemEvent(trx: Knex.Transaction, e: ItemEventInput): Promise<void> {
  await trx('stock_request_item_events').insert({
    item_id: e.itemId,
    request_id: e.requestId,
    event_type: e.eventType,
    from_status: e.fromStatus ?? null,
    to_status: e.toStatus ?? null,
    actor_user_id: e.actorUserId ?? null,
    note_ar: e.noteAr ?? null,
    shipment_id: e.shipmentId ?? null,
    shipment_line_id: e.shipmentLineId ?? null,
  });
}

/**
 * Serialize the request-LEVEL operations that read a set of items and then act on
 * it (add tops / cancel the request / open a draft). A transaction-scoped advisory
 * lock keyed by the request id: it lives OUTSIDE the row-lock graph (nobody takes it
 * while already holding a row lock), so it cannot take part in a deadlock cycle.
 * Take it FIRST in the transaction.
 */
const REQUEST_LOCK_NAMESPACE = 7_301_000_000_000;
export async function lockRequestOperations(trx: Knex.Transaction, requestId: number): Promise<void> {
  await trx.raw('SELECT pg_advisory_xact_lock(?::bigint)', [REQUEST_LOCK_NAMESPACE + requestId]);
}

/** Lock the request row (last in the lock order) and return it as of that moment. */
export async function lockRequestLast(trx: Knex.Transaction, requestId: number) {
  return trx('stock_requests').where({ id: requestId }).forNoKeyUpdate().first();
}

/**
 * Re-derive and store the request status from its items and their shipment
 * lines. The definition lives in ONE place — the SQL function
 * stock_request_derived_status() — which the rolls trigger also uses.
 */
export async function recomputeRequestStatus(trx: Knex.Transaction, requestId: number): Promise<RequestStatus> {
  await lockRequestLast(trx, requestId);
  // a separate statement after the lock => fresh snapshot, sees every committed change
  const [row] = await trx('stock_requests')
    .where({ id: requestId })
    .update({ status: trx.raw('stock_request_derived_status(?)', [requestId]), updated_at: trx.fn.now() })
    .returning('status');
  return row.status as RequestStatus;
}

export async function nextRequestNo(trx: Knex.Transaction, year: number): Promise<string> {
  await trx.raw(
    `INSERT INTO stock_request_sequence (year, next_no) VALUES (?, 1) ON CONFLICT (year) DO NOTHING`,
    [year],
  );
  const result = await trx.raw<{ rows: Array<{ used_no: number | string }> }>(
    `UPDATE stock_request_sequence SET next_no = next_no + 1 WHERE year = ? RETURNING (next_no - 1) AS used_no`,
    [year],
  );
  const usedNo = Number(result.rows[0].used_no);
  return `REQ-${year}-${String(usedNo).padStart(6, '0')}`;
}

/** Active (requested / packing) request item for each roll id, if any. */
export async function findActiveReservations(
  trx: Knex | Knex.Transaction,
  rollIds: number[],
): Promise<Array<{ roll_id: number; item_id: number; request_id: number; request_no: string; status: ItemStatus }>> {
  if (rollIds.length === 0) return [];
  return trx('stock_request_items as i')
    .join('stock_requests as r', 'r.id', 'i.request_id')
    .whereIn('i.roll_id', rollIds)
    .whereIn('i.status', ACTIVE_ITEM_STATUSES)
    .select('i.roll_id', 'i.id as item_id', 'i.request_id', 'r.request_no', 'i.status');
}

/** What the shop sees for one item. Derived — never stored. */
export type ItemOutcome =
  | 'waiting'          // requested, factory has not scanned it yet
  | 'packing'          // scanned onto the factory's open draft
  | 'awaiting_review'  // sent, the shop has not decided yet
  | 'accepted'
  | 'rejected'
  | 'unavailable'
  | 'cancelled';

export function itemOutcome(status: ItemStatus, lineStatus: string | null): ItemOutcome {
  switch (status) {
    case 'requested': return 'waiting';
    case 'packing': return 'packing';
    case 'unavailable': return 'unavailable';
    case 'cancelled': return 'cancelled';
    case 'dispatched':
      return lineStatus === 'accepted' ? 'accepted' : lineStatus === 'rejected' ? 'rejected' : 'awaiting_review';
  }
}

/** Postgres error details, as thrown by knex/pg. */
export function pgError(e: unknown): { code?: string; constraint?: string } {
  const x = e as { code?: string; constraint?: string };
  return { code: x?.code, constraint: x?.constraint };
}
