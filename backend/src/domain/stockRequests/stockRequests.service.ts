import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import { logger } from '../../lib/logger.js';
import { auditFromService } from '../inventory/audit.helper.js';
import { insertDraft } from '../inventory/shipments.service.js';
import { notify, type NotifyInput } from '../notifications/notificationsService.js';
import {
  ACTIVE_ITEM_STATUSES,
  findActiveReservations,
  itemOutcome,
  lockRequestLast,
  lockRequestOperations,
  logItemEvent,
  nextRequestNo,
  pgError,
  recomputeRequestStatus,
  type ItemOutcome,
  type ItemStatus,
  type RequestStatus,
} from './requestStatus.js';
import type {
  AddRequestItemsInput,
  AvailableRollsQueryInput,
  CreateStockRequestInput,
  ListStockRequestsQueryInput,
} from './stockRequests.schemas.js';

/** Throw a domain error: the message IS the code, optionally with the failing barcodes. */
function fail(code: string, barcodes?: string[]): never {
  throw Object.assign(new Error(code), barcodes && barcodes.length > 0 ? { barcodes } : {});
}

/** Notifications are written AFTER the transaction commits; a failure never undoes the business action. */
async function sendAfterCommit(items: NotifyInput[]): Promise<void> {
  for (const n of items) {
    try {
      await notify(n);
    } catch (err) {
      logger.error({ err, eventType: n.eventType }, 'stock request notification failed (business action already committed)');
    }
  }
}

type LockedRoll = {
  id: number;
  internal_barcode: string;
  warehouse: string;
  status: string;
  length_m: string | null;
  fabric_unit: string;
};

/**
 * Lock the given tops (in id order => no deadlocks between concurrent requests)
 * and make sure every one is a free, shippable factory top. Throws a domain
 * error naming the failing barcodes, so the whole request is all-or-nothing.
 */
async function lockReservableRolls(trx: Knex.Transaction, rollIds: number[]): Promise<LockedRoll[]> {
  const rolls: LockedRoll[] = await trx('rolls as r')
    .join('fabrics as f', 'f.id', 'r.fabric_id')
    .whereIn('r.id', rollIds)
    .orderBy('r.id')
    .forUpdate('r')
    .select('r.id', 'r.internal_barcode', 'r.warehouse', 'r.status', 'r.length_m', 'f.unit as fabric_unit');

  if (rolls.length !== rollIds.length) fail('ROLL_NOT_FOUND');

  const notFactory = rolls.filter((r) => r.warehouse !== 'factory');
  if (notFactory.length > 0) fail('ROLL_NOT_IN_FACTORY', notFactory.map((r) => r.internal_barcode));

  const notAvailable = rolls.filter((r) => r.status !== 'in_stock');
  if (notAvailable.length > 0) fail('ROLL_NOT_AVAILABLE', notAvailable.map((r) => r.internal_barcode));

  // The factory could never ship a metre top without a length (shipments refuse it).
  const noLength = rolls.filter((r) => r.fabric_unit === 'meter' && (r.length_m === null || r.length_m === undefined));
  if (noLength.length > 0) fail('ROLL_MISSING_LENGTH', noLength.map((r) => r.internal_barcode));

  const reserved = await findActiveReservations(trx, rollIds);
  if (reserved.length > 0) {
    const byId = new Map(rolls.map((r) => [Number(r.id), r.internal_barcode]));
    fail('ROLL_ALREADY_REQUESTED', reserved.map((x) => byId.get(Number(x.roll_id)) ?? String(x.roll_id)));
  }
  return rolls;
}

/** The unique index is the final guard against a double reservation. */
function mapReservationRace(e: unknown): never {
  const { code, constraint } = pgError(e);
  if (code === '23505' && constraint === 'ux_stock_request_items_active_roll') fail('ROLL_ALREADY_REQUESTED');
  if (code === '23505' && constraint === 'ux_sri_replaces_once') fail('REPLACEMENT_ALREADY_EXISTS');
  throw e;
}

async function insertItems(
  trx: Knex.Transaction,
  requestId: number,
  rollIds: number[],
  actorUserId: number,
  replacesItemId: number | null,
): Promise<Array<{ id: number; roll_id: number }>> {
  try {
    const inserted: Array<{ id: number; roll_id: number }> = await trx('stock_request_items')
      .insert(rollIds.map((roll_id) => ({
        request_id: requestId,
        roll_id,
        status: 'requested',
        replaces_item_id: replacesItemId,
        added_by_user_id: actorUserId,
      })))
      .returning(['id', 'roll_id']);
    return inserted;
  } catch (e) {
    return mapReservationRace(e);
  }
}

// ---------------------------------------------------------------------------
// Create / extend
// ---------------------------------------------------------------------------

export async function createRequest(actorUserId: number, input: CreateStockRequestInput) {
  const rollIds = [...new Set(input.roll_ids.map(Number))].sort((a, b) => a - b);

  const { requestId, notifications } = await db.transaction(async (trx) => {
    await lockReservableRolls(trx, rollIds);

    const request_no = await nextRequestNo(trx, new Date().getFullYear());
    const [{ id }] = await trx('stock_requests')
      .insert({ request_no, requested_by_user_id: actorUserId, notes_ar: input.notes_ar ?? null })
      .returning('id');
    const requestId = Number(id);

    const items = await insertItems(trx, requestId, rollIds, actorUserId, null);
    for (const it of items) {
      await logItemEvent(trx, {
        itemId: Number(it.id), requestId, eventType: 'requested', toStatus: 'requested', actorUserId,
      });
    }

    await auditFromService(trx, {
      actorUserId,
      action: 'create_stock_request',
      entity: 'stock_request',
      entityId: requestId,
      after: { request_no, status: 'open', item_count: items.length, roll_ids: rollIds },
      severity: 'medium',
    });
    await recomputeRequestStatus(trx, requestId);

    return {
      requestId,
      notifications: [{
        recipientRole: 'factory_sender',
        severity: 'medium',
        eventType: 'stock_request_created',
        titleAr: 'طلب أتواب جديد من المحل',
        bodyAr: `طلب رقم ${request_no} يحتوي على ${items.length} توب في انتظار التجهيز`,
        payload: { request_id: requestId, request_no, item_count: items.length },
      } satisfies NotifyInput],
    };
  });

  await sendAfterCommit(notifications);
  return getRequest(requestId);
}

/**
 * Add tops to an existing request — optionally as the replacement (or a retry)
 * of an item that was unavailable or rejected. The replaced item is never
 * touched: the new item points back at it, so the whole chain stays visible.
 */
export async function addItems(requestId: number, actorUserId: number, input: AddRequestItemsInput) {
  const rollIds = [...new Set(input.roll_ids.map(Number))].sort((a, b) => a - b);

  const { notifications } = await db.transaction(async (trx) => {
    await lockRequestOperations(trx, requestId); // vs. a concurrent cancel of the same request
    const request = await trx('stock_requests').where({ id: requestId }).first();
    if (!request) fail('REQUEST_NOT_FOUND');
    if (request.cancelled_at || request.status === 'cancelled') fail('REQUEST_CANCELLED');

    let replaced: { id: number; status: ItemStatus; line_status: string | null } | undefined;
    if (input.replaces_item_id !== undefined) {
      if (rollIds.length !== 1) fail('REPLACEMENT_NEEDS_ONE_ROLL');
      replaced = await trx('stock_request_items as i')
        .leftJoin('shipment_lines as sl', 'sl.id', 'i.shipment_line_id')
        .where({ 'i.id': input.replaces_item_id, 'i.request_id': requestId })
        .first('i.id', 'i.status', 'sl.status as line_status');
      if (!replaced) fail('ITEM_NOT_FOUND');
      const replaceable = replaced.status === 'unavailable' || (replaced.status === 'dispatched' && replaced.line_status === 'rejected');
      if (!replaceable) fail('ITEM_NOT_REPLACEABLE');
    }

    await lockReservableRolls(trx, rollIds);
    const items = await insertItems(trx, requestId, rollIds, actorUserId, replaced ? Number(replaced.id) : null);

    for (const it of items) {
      await logItemEvent(trx, {
        itemId: Number(it.id), requestId,
        eventType: replaced ? 'replacement_requested' : 'requested',
        toStatus: 'requested', actorUserId,
        noteAr: replaced ? `بديل عن البند رقم ${replaced.id}` : null,
      });
    }
    if (replaced) {
      // history on the OLD item without modifying the item row itself
      await logItemEvent(trx, {
        itemId: Number(replaced.id), requestId, eventType: 'replaced_by', actorUserId,
        noteAr: `تم طلب بديل: البند رقم ${items[0].id}`,
      });
    }

    await auditFromService(trx, {
      actorUserId,
      action: replaced ? 'request_item_replacement' : 'add_stock_request_items',
      entity: 'stock_request',
      entityId: requestId,
      after: { roll_ids: rollIds, replaces_item_id: replaced?.id ?? null, item_ids: items.map((i) => i.id) },
      severity: 'medium',
    });

    // Request row locked LAST; re-check cancellation under that lock (closes the
    // race with a concurrent whole-request cancel).
    const locked = await lockRequestLast(trx, requestId);
    if (locked.cancelled_at) fail('REQUEST_CANCELLED');
    await recomputeRequestStatus(trx, requestId);

    return {
      notifications: [{
        recipientRole: 'factory_sender',
        severity: 'medium',
        eventType: 'stock_request_items_added',
        titleAr: replaced ? 'طلب توب بديل' : 'إضافة أتواب إلى طلب',
        bodyAr: `طلب رقم ${request.request_no}: ${replaced ? 'تم طلب بديل' : `أُضيف ${items.length} توب`}`,
        payload: { request_id: requestId, request_no: request.request_no, item_count: items.length },
      } satisfies NotifyInput],
    };
  });

  await sendAfterCommit(notifications);
  return getRequest(requestId);
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

/** Withdraw one top the factory has not started packing. */
export async function cancelItem(requestId: number, itemId: number, actorUserId: number, reason: string | null) {
  await db.transaction(async (trx) => {
    const item = await trx('stock_request_items').where({ id: itemId, request_id: requestId }).forNoKeyUpdate().first();
    if (!item) fail('ITEM_NOT_FOUND');
    if (item.status === 'packing') fail('ITEM_BEING_PACKED');
    if (item.status !== 'requested') fail('ITEM_NOT_CANCELLABLE');

    await trx('stock_request_items').where({ id: itemId }).update({
      status: 'cancelled', cancelled_by_user_id: actorUserId, cancelled_at: trx.fn.now(), updated_at: trx.fn.now(),
    });
    await logItemEvent(trx, {
      itemId, requestId, eventType: 'cancelled', fromStatus: 'requested', toStatus: 'cancelled', actorUserId, noteAr: reason,
    });
    await auditFromService(trx, {
      actorUserId, action: 'cancel_stock_request_item', entity: 'stock_request_item', entityId: itemId,
      before: { status: 'requested' }, after: { status: 'cancelled', reason }, severity: 'medium',
    });
    await recomputeRequestStatus(trx, requestId);
  });
  return getRequest(requestId);
}

/**
 * Cancel everything the factory has not started on. Refused while the factory
 * is packing any item, so a vehicle being loaded is never pulled from under it.
 * Items already dispatched keep going through the normal shipment review.
 */
export async function cancelRequest(requestId: number, actorUserId: number, reasonInput: string) {
  const reason = (reasonInput ?? '').trim();
  if (reason.length < 2) fail('REASON_REQUIRED');
  const { notifications } = await db.transaction(async (trx) => {
    await lockRequestOperations(trx, requestId); // vs. a concurrent addItems on the same request
    const request = await trx('stock_requests').where({ id: requestId }).first();
    if (!request) fail('REQUEST_NOT_FOUND');
    if (request.cancelled_at) fail('REQUEST_CANCELLED');

    const active: Array<{ id: number; status: ItemStatus }> = await trx('stock_request_items')
      .where({ request_id: requestId })
      .whereIn('status', ACTIVE_ITEM_STATUSES)
      .orderBy('id')
      .forNoKeyUpdate()
      .select('id', 'status');
    if (active.some((i) => i.status === 'packing')) fail('REQUEST_HAS_PACKING_ITEMS');
    if (active.length === 0) fail('NOTHING_TO_CANCEL');

    await trx('stock_request_items').whereIn('id', active.map((i) => i.id)).update({
      status: 'cancelled', cancelled_by_user_id: actorUserId, cancelled_at: trx.fn.now(), updated_at: trx.fn.now(),
    });
    for (const it of active) {
      await logItemEvent(trx, {
        itemId: Number(it.id), requestId, eventType: 'cancelled', fromStatus: 'requested', toStatus: 'cancelled',
        actorUserId, noteAr: reason,
      });
    }
    await trx('stock_requests').where({ id: requestId }).update({
      cancelled_by_user_id: actorUserId, cancelled_at: trx.fn.now(), cancel_reason_ar: reason,
    });
    await auditFromService(trx, {
      actorUserId, action: 'cancel_stock_request', entity: 'stock_request', entityId: requestId,
      after: { reason, cancelled_item_ids: active.map((i) => i.id) }, severity: 'medium',
    });
    await recomputeRequestStatus(trx, requestId);

    return {
      notifications: [{
        recipientRole: 'factory_sender',
        severity: 'medium',
        eventType: 'stock_request_cancelled',
        titleAr: 'تم إلغاء طلب أتواب',
        bodyAr: `طلب رقم ${request.request_no}: ${reason}`,
        payload: { request_id: requestId, request_no: request.request_no },
      } satisfies NotifyInput],
    };
  });
  await sendAfterCommit(notifications);
  return getRequest(requestId);
}

// ---------------------------------------------------------------------------
// Factory side
// ---------------------------------------------------------------------------

/** The factory cannot send this top. The reason is mandatory and stays on the item forever. */
export async function markUnavailable(requestId: number, itemId: number, actorUserId: number, reasonInput: string) {
  const reason = (reasonInput ?? '').trim();
  if (reason.length < 2) fail('REASON_REQUIRED');
  const { notifications } = await db.transaction(async (trx) => {
    const item = await trx('stock_request_items').where({ id: itemId, request_id: requestId }).forNoKeyUpdate().first();
    if (!item) fail('ITEM_NOT_FOUND');
    if (item.status === 'packing') fail('ITEM_BEING_PACKED');
    if (item.status !== 'requested') fail('ITEM_NOT_REQUESTED');

    await trx('stock_request_items').where({ id: itemId }).update({
      status: 'unavailable',
      unavailable_reason_ar: reason,
      unavailable_by_user_id: actorUserId,
      unavailable_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });
    await logItemEvent(trx, {
      itemId, requestId, eventType: 'unavailable', fromStatus: 'requested', toStatus: 'unavailable', actorUserId, noteAr: reason,
    });
    await auditFromService(trx, {
      actorUserId, action: 'mark_request_item_unavailable', entity: 'stock_request_item', entityId: itemId,
      before: { status: 'requested' }, after: { status: 'unavailable', reason }, severity: 'medium',
    });
    await recomputeRequestStatus(trx, requestId);

    const reqRow = await trx('stock_requests').where({ id: requestId }).first('request_no');
    const rollRow = await trx('rolls').where({ id: item.roll_id }).first('internal_barcode');
    const meta = { request_no: reqRow?.request_no, internal_barcode: rollRow?.internal_barcode };
    return {
      notifications: [{
        recipientRole: 'shop_seller',
        severity: 'medium',
        eventType: 'stock_request_item_unavailable',
        titleAr: 'توب غير متوفر في المصنع',
        bodyAr: `طلب رقم ${meta?.request_no}: التوب ${meta?.internal_barcode} غير متوفر — ${reason}`,
        payload: { request_id: requestId, item_id: itemId, request_no: meta?.request_no },
      } satisfies NotifyInput],
    };
  });
  await sendAfterCommit(notifications);
  return getRequest(requestId);
}

/**
 * The open draft shipment that fulfils this request (created on first use).
 * One draft at a time per request — enforced by a partial unique index, so a
 * double click returns the same draft instead of creating two.
 */
export async function openDraftShipment(requestId: number, actorUserId: number) {
  const findDraft = (q: Knex | Knex.Transaction) =>
    q('shipments').where({ stock_request_id: requestId, status: 'draft' }).first();

  try {
    return await db.transaction(async (trx) => {
      await lockRequestOperations(trx, requestId);
      const request = await trx('stock_requests').where({ id: requestId }).first();
      if (!request) fail('REQUEST_NOT_FOUND');
      if (request.cancelled_at) fail('REQUEST_CANCELLED');

      const existing = await findDraft(trx);
      if (existing) return existing;

      const waiting = await trx('stock_request_items').where({ request_id: requestId, status: 'requested' }).first('id');
      if (!waiting) fail('NOTHING_TO_PACK');
      return insertDraft(trx, actorUserId, null, requestId);
    });
  } catch (e) {
    const { code, constraint } = pgError(e);
    if (code === '23505' && constraint === 'ux_shipments_one_draft_per_request') {
      const existing = await findDraft(db);
      if (existing) return existing;
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const REQUEST_COUNTS_SQL = `
  c.total, c.requested, c.packing, c.dispatched, c.unavailable, c.cancelled,
  c.awaiting_review, c.accepted, c.rejected
`;

export async function listRequests(filters: ListStockRequestsQueryInput, actorUserId: number) {
  const q = db('stock_requests as r')
    .join('users as u', 'u.id', 'r.requested_by_user_id')
    .joinRaw(`
      LEFT JOIN LATERAL (
        SELECT
          count(*)::int                                                              AS total,
          (count(*) FILTER (WHERE i.status = 'requested'))::int                      AS requested,
          (count(*) FILTER (WHERE i.status = 'packing'))::int                        AS packing,
          (count(*) FILTER (WHERE i.status = 'dispatched'))::int                     AS dispatched,
          (count(*) FILTER (WHERE i.status = 'unavailable'))::int                    AS unavailable,
          (count(*) FILTER (WHERE i.status = 'cancelled'))::int                      AS cancelled,
          (count(*) FILTER (WHERE i.status = 'dispatched' AND sl.status = 'pending'))::int  AS awaiting_review,
          (count(*) FILTER (WHERE i.status = 'dispatched' AND sl.status = 'accepted'))::int AS accepted,
          (count(*) FILTER (WHERE i.status = 'dispatched' AND sl.status = 'rejected'))::int AS rejected
        FROM stock_request_items i
        LEFT JOIN shipment_lines sl ON sl.id = i.shipment_line_id
        WHERE i.request_id = r.id
      ) c ON true
    `)
    .select('r.*', 'u.full_name_ar as requested_by_name', db.raw(REQUEST_COUNTS_SQL))
    .orderBy('r.id', 'desc')
    .limit(filters.limit);

  if (filters.status) {
    q.whereIn('r.status', filters.status.split(',').map((s) => s.trim()).filter(Boolean));
  }
  if (filters.active) q.whereIn('r.status', ['open', 'in_progress', 'awaiting_review']);
  if (filters.mine) q.where('r.requested_by_user_id', actorUserId);
  if (filters.q) q.whereILike('r.request_no', `%${filters.q}%`);
  return q;
}

export type RequestItemView = {
  id: number;
  status: ItemStatus;
  outcome: ItemOutcome;
  roll_id: number;
  internal_barcode: string;
  external_barcode: string | null;
  fabric_id: number;
  fabric_name_ar: string;
  fabric_unit: string;
  color_name_ar: string;
  color_code: string | null;
  weight_kg: string | null;
  length_m: string | null;
  roll_status: string;
  roll_warehouse: string;
  /** requested items only: is the top still on the factory shelf? */
  live_available: boolean;
  shipment_id: number | null;
  shipment_no: string | null;
  shipment_status: string | null;
  line_id: number | null;
  line_status: string | null;
  reject_reason_ar: string | null;
  replaces_item_id: number | null;
  replaced_by_item_id: number | null;
  unavailable_reason_ar: string | null;
  unavailable_at: string | null;
  unavailable_by_user_id: number | null;
  unavailable_by_name: string | null;
  auto_unavailable: boolean;
  can_replace: boolean;
  created_at: string;
  events: Array<{
    id: number; event_type: string; from_status: string | null; to_status: string | null;
    actor_user_id: number | null; actor_name: string | null; note_ar: string | null;
    shipment_id: number | null; created_at: string;
  }>;
};

export async function getRequest(id: number) {
  const request = await db('stock_requests as r')
    .join('users as u', 'u.id', 'r.requested_by_user_id')
    .where('r.id', id)
    .first('r.*', 'u.full_name_ar as requested_by_name');
  if (!request) return undefined;

  const rows = await db('stock_request_items as i')
    .join('rolls as ro', 'ro.id', 'i.roll_id')
    .join('fabrics as f', 'f.id', 'ro.fabric_id')
    .join('colors as c', 'c.id', 'ro.color_id')
    .leftJoin('shipments as s', 's.id', 'i.shipment_id')
    .leftJoin('shipment_lines as sl', 'sl.id', 'i.shipment_line_id')
    .leftJoin('stock_request_items as rep', 'rep.replaces_item_id', 'i.id')
    .leftJoin('users as ub', 'ub.id', 'i.unavailable_by_user_id')
    .where('i.request_id', id)
    .orderBy('i.id')
    .select(
      'i.id', 'i.status', 'i.roll_id', 'i.shipment_id', 'i.shipment_line_id', 'i.replaces_item_id',
      'i.unavailable_reason_ar', 'i.unavailable_at', 'i.unavailable_by_user_id', 'i.created_at',
      'ub.full_name_ar as unavailable_by_name',
      'ro.internal_barcode', 'ro.external_barcode', 'ro.status as roll_status', 'ro.warehouse as roll_warehouse',
      'ro.weight_kg', 'ro.length_m', 'ro.fabric_id',
      'f.name_ar as fabric_name_ar', 'f.unit as fabric_unit',
      'c.name_ar as color_name_ar', 'c.code as color_code',
      's.shipment_no', 's.status as shipment_status',
      'sl.status as line_status', 'sl.reject_reason_ar',
      'rep.id as replaced_by_item_id',
    );

  const events = await db('stock_request_item_events as e')
    .leftJoin('users as u', 'u.id', 'e.actor_user_id')
    .where('e.request_id', id)
    .orderBy('e.id')
    .select('e.id', 'e.item_id', 'e.event_type', 'e.from_status', 'e.to_status', 'e.actor_user_id',
      'u.full_name_ar as actor_name', 'e.note_ar', 'e.shipment_id', 'e.created_at');
  const eventsByItem = new Map<number, RequestItemView['events']>();
  for (const e of events) {
    const list = eventsByItem.get(Number(e.item_id)) ?? [];
    list.push(e);
    eventsByItem.set(Number(e.item_id), list);
  }

  const requestClosed = Boolean(request.cancelled_at) || request.status === 'cancelled';
  const items: RequestItemView[] = rows.map((r) => {
    const outcome = itemOutcome(r.status, r.line_status);
    return {
      ...r,
      outcome,
      line_id: r.shipment_line_id,
      live_available: r.status !== 'requested' || (r.roll_warehouse === 'factory' && r.roll_status === 'in_stock'),
      replaced_by_item_id: r.replaced_by_item_id ?? null,
      auto_unavailable: r.status === 'unavailable' && r.unavailable_by_user_id === null,
      can_replace: !requestClosed && !r.replaced_by_item_id && (r.status === 'unavailable' || outcome === 'rejected'),
      events: eventsByItem.get(Number(r.id)) ?? [],
    };
  });

  const shipments = await db('shipments as s')
    .where('s.stock_request_id', id)
    .orderBy('s.id')
    .select(
      's.id', 's.shipment_no', 's.status', 's.created_by_user_id', 's.submitted_at', 's.reviewed_at',
      db.raw('(SELECT COUNT(*)::int FROM shipment_lines sl WHERE sl.shipment_id = s.id) AS line_count'),
      db.raw(`(SELECT COUNT(*)::int FROM shipment_lines sl WHERE sl.shipment_id = s.id AND sl.status = 'accepted') AS accepted_count`),
      db.raw(`(SELECT COUNT(*)::int FROM shipment_lines sl WHERE sl.shipment_id = s.id AND sl.status = 'rejected') AS rejected_count`),
      db.raw(`(SELECT COUNT(*)::int FROM shipment_lines sl WHERE sl.shipment_id = s.id AND sl.status = 'pending') AS pending_count`),
    );

  const count = (pred: (i: RequestItemView) => boolean) => items.filter(pred).length;
  return {
    ...request,
    status: request.status as RequestStatus,
    counts: {
      total: items.length,
      requested: count((i) => i.status === 'requested'),
      packing: count((i) => i.status === 'packing'),
      dispatched: count((i) => i.status === 'dispatched'),
      unavailable: count((i) => i.status === 'unavailable'),
      cancelled: count((i) => i.status === 'cancelled'),
      awaiting_review: count((i) => i.outcome === 'awaiting_review'),
      accepted: count((i) => i.outcome === 'accepted'),
      rejected: count((i) => i.outcome === 'rejected'),
    },
    draft_shipment: shipments.find((s) => s.status === 'draft') ?? null,
    items,
    shipments,
  };
}

/** What the shop may pick: factory tops that are free, shippable and not reserved. */
export async function listAvailableRolls(filters: AvailableRollsQueryInput) {
  const q = db('rolls as r')
    .join('fabrics as f', 'f.id', 'r.fabric_id')
    .join('colors as c', 'c.id', 'r.color_id')
    .where('r.warehouse', 'factory')
    .where('r.status', 'in_stock')
    .whereNotExists(function () {
      this.select(db.raw('1')).from('stock_request_items as i')
        .whereRaw('i.roll_id = r.id')
        .whereIn('i.status', ACTIVE_ITEM_STATUSES);
    })
    .whereRaw(`NOT (f.unit = 'meter' AND r.length_m IS NULL)`)
    .select(
      'r.id', 'r.internal_barcode', 'r.weight_kg', 'r.length_m', 'r.fabric_id', 'r.color_id',
      'f.unit as fabric_unit', 'f.name_ar as fabric_name_ar', 'c.name_ar as color_name_ar', 'c.code as color_code',
    )
    .orderBy('r.id', 'desc')
    .limit(filters.limit);

  if (filters.fabric_id !== undefined) q.where('r.fabric_id', filters.fabric_id);
  if (filters.color_id !== undefined) q.where('r.color_id', filters.color_id);
  if (filters.q) {
    q.where((b) =>
      b.whereILike('r.internal_barcode', `%${filters.q}%`)
        .orWhereILike('r.external_barcode', `%${filters.q}%`)
        .orWhereILike('f.name_ar', `%${filters.q}%`)
        .orWhereILike('c.name_ar', `%${filters.q}%`),
    );
  }
  return q;
}

/** Counters for dashboards / the nav badge. */
export async function getSummary() {
  const row = await db('stock_requests')
    .select(
      db.raw(`(count(*) FILTER (WHERE status IN ('open','in_progress')))::int AS to_prepare`),
      db.raw(`(count(*) FILTER (WHERE status = 'awaiting_review'))::int AS awaiting_review`),
    )
    .first();
  const items = await db('stock_request_items as i')
    .join('stock_requests as r', 'r.id', 'i.request_id')
    .whereIn('r.status', ['open', 'in_progress'])
    .where('i.status', 'requested')
    .count<{ n: string }[]>({ n: '*' });
  return { to_prepare: row?.to_prepare ?? 0, awaiting_review: row?.awaiting_review ?? 0, items_to_pack: Number(items[0]?.n ?? 0) };
}
