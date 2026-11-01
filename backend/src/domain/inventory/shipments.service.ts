import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import { nextShipmentNo } from './shipmentNumber.service.js';
import { auditFromService } from './audit.helper.js';
import { notify } from '../notifications/notificationsService.js';
import { ACTIVE_ITEM_STATUSES, logItemEvent, recomputeRequestStatus } from '../stockRequests/requestStatus.js';
import type {
  Shipment,
  ShipmentLine,
  ShipmentWithLines,
} from './inventory.types.js';
import type {
  AcceptShipmentInput,
  AddShipmentRollInput,
  BulkReviewShipmentLinesInput,
  CreateShipmentDraftInput,
  ListFactoryRollsQueryInput,
  ListShipmentsQueryInput,
} from './inventory.schemas.js';

// Shipments whose lines still claim their أتواب. partial_approved is a final
// state (set once no line is pending), so it is NOT active: its rejected
// أتواب are back in the factory and may be sent again. Within an active
// shipment only `pending` lines still claim their توب — accepted ones are
// already in the shop and rejected ones are already back in the factory.
const ACTIVE_SHIPMENT_STATUSES = ['draft', 'pending_approval'] as const;

// A توب leaves «قيد الشحن» when its line is removed, its draft is deleted, or
// the shop rejects it. Only in_transit rows are touched, so a status set by
// another flow is never clobbered.
async function releaseRolls(trx: Knex.Transaction, rollIds: number[]): Promise<void> {
  if (rollIds.length === 0) return;
  await trx('rolls')
    .whereIn('id', rollIds)
    .where('status', 'in_transit')
    .update({ status: 'in_stock', updated_at: trx.fn.now() });
}

// ---------------------------------------------------------------------------
// Stock-request integration. Everything below runs ONLY for a shipment whose
// stock_request_id is set (never for a legacy / manual shipment), except the
// two read-only reservation checks noted in addRoll and undoLines.
// ---------------------------------------------------------------------------

/** The request item that was packed on this line goes back to «requested». */
async function unpackRequestItems(
  trx: Knex.Transaction,
  where: { shipment_line_id?: number; shipment_id?: number },
  actorUserId: number,
  note: string,
): Promise<void> {
  const items = await trx('stock_request_items').where(where).where({ status: 'packing' }).forNoKeyUpdate().select('id', 'request_id', 'shipment_id', 'shipment_line_id');
  for (const it of items) {
    await trx('stock_request_items').where({ id: it.id }).update({
      status: 'requested', shipment_id: null, shipment_line_id: null, updated_at: trx.fn.now(),
    });
    await logItemEvent(trx, {
      itemId: Number(it.id), requestId: Number(it.request_id), eventType: 'unpacked',
      fromStatus: 'packing', toStatus: 'requested', actorUserId, noteAr: note,
      shipmentId: Number(it.shipment_id), shipmentLineId: Number(it.shipment_line_id),
    });
  }
}

/** Submit of a request shipment: packing items become «dispatched». Returns the request number. */
async function dispatchRequestItems(
  trx: Knex.Transaction,
  shipment: Shipment & { stock_request_id: number },
  lineCount: number,
  actorUserId: number,
): Promise<string> {
  const items = await trx('stock_request_items').where({ shipment_id: shipment.id }).orderBy('id').forNoKeyUpdate()
    .select('id', 'status', 'shipment_line_id');
  if (items.length !== lineCount || items.some((i) => i.status !== 'packing')) {
    throw new Error('REQUEST_SHIPMENT_INCONSISTENT');
  }
  await trx('stock_request_items').where({ shipment_id: shipment.id }).update({ status: 'dispatched', updated_at: trx.fn.now() });
  for (const it of items) {
    await logItemEvent(trx, {
      itemId: Number(it.id), requestId: Number(shipment.stock_request_id), eventType: 'dispatched',
      fromStatus: 'packing', toStatus: 'dispatched', actorUserId,
      shipmentId: Number(shipment.id), shipmentLineId: Number(it.shipment_line_id),
    });
  }
  await auditFromService(trx, {
    actorUserId, action: 'dispatch_request_items', entity: 'stock_request', entityId: shipment.stock_request_id,
    after: { shipment_id: shipment.id, shipment_no: shipment.shipment_no, item_ids: items.map((i) => i.id) }, severity: 'medium',
  });
  await recomputeRequestStatus(trx, Number(shipment.stock_request_id));
  const request = await trx('stock_requests').where({ id: shipment.stock_request_id }).first('request_no');
  return request.request_no as string;
}

/** Item history + request status after the shop accepted / rejected / undid lines. */
async function recordLinkedReview(
  trx: Knex.Transaction,
  requestId: number,
  lineIds: number[],
  action: 'accept' | 'reject' | 'reset',
  reason: string | null,
  actorUserId: number,
): Promise<void> {
  const items = await trx('stock_request_items').whereIn('shipment_line_id', lineIds).select('id', 'shipment_id', 'shipment_line_id');
  const eventType = action === 'accept' ? 'line_accepted' : action === 'reject' ? 'line_rejected' : 'line_review_reset';
  for (const it of items) {
    await logItemEvent(trx, {
      itemId: Number(it.id), requestId, eventType, fromStatus: 'dispatched', toStatus: 'dispatched', actorUserId,
      noteAr: action === 'reject' ? reason : null, shipmentId: Number(it.shipment_id), shipmentLineId: Number(it.shipment_line_id),
    });
  }
  await recomputeRequestStatus(trx, requestId);
}

type ReviewLineRow = ShipmentLine & {
  internal_barcode: string;
  warehouse: string;
  roll_status: string;
  length_m: string | null;
  fabric_unit: string;
};

/** Accepted توب = received: it moves into the shop warehouse right away. */
async function receiveLines(trx: Knex.Transaction, shipmentId: number, lines: ReviewLineRow[], actorUserId: number): Promise<void> {
  const missingLength = lines.filter((l) => l.fabric_unit === 'meter' && (l.length_m === null || l.length_m === undefined));
  if (missingLength.length > 0) {
    throw Object.assign(new Error('METER_ROLL_MISSING_LENGTH'), { barcodes: missingLength.map((l) => l.internal_barcode) });
  }
  for (const line of lines) {
    await trx('rolls').where({ id: line.roll_id }).update({
      warehouse: 'shop',
      status: 'in_stock',
      received_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });
    await trx('stock_movements').insert({
      roll_id: line.roll_id,
      from_warehouse: null,
      to_warehouse: 'shop',
      event_type: 'shipment_in',
      reference_type: 'shipment',
      reference_id: shipmentId,
      actor_user_id: actorUserId,
    });
  }
}

/** Rejected أتواب go back to the factory as «متاح» right away and can be sent again. */
async function returnLinesToFactory(
  trx: Knex.Transaction,
  shipmentId: number,
  lines: ReviewLineRow[],
  reason: string | null,
  actorUserId: number,
): Promise<void> {
  await releaseRolls(trx, lines.map((l) => Number(l.roll_id)));
  for (const line of lines) {
    await trx('stock_movements').insert({
      roll_id: line.roll_id,
      from_warehouse: null,
      to_warehouse: 'factory',
      event_type: 'shipment_reject_back',
      reference_type: 'shipment',
      reference_id: shipmentId,
      actor_user_id: actorUserId,
      notes_ar: reason,
    });
  }
}

/**
 * Undo a review decision. Only allowed while the توب is untouched since the
 * decision — still «متاح» where the decision put it, and the decision's
 * movement is still its latest — so a sold / moved / re-shipped توب can
 * never be pulled back. The توب returns to «قيد الشحن» awaiting review.
 */
async function undoLines(trx: Knex.Transaction, shipmentId: number, lines: ReviewLineRow[], actorUserId: number): Promise<void> {
  for (const line of lines) {
    const accepted = line.status === 'accepted';
    const expectedWarehouse = accepted ? 'shop' : 'factory';
    const expectedEvent = accepted ? 'shipment_in' : 'shipment_reject_back';
    const last = await trx('stock_movements')
      .where({ roll_id: line.roll_id })
      .orderBy('id', 'desc')
      .first('event_type', 'reference_type', 'reference_id');
    // A rejected توب may meanwhile have been requested again (replacement / retry).
    // Pulling it back «قيد الشحن» would put one توب in two places at once.
    const reservedAgain = await trx('stock_request_items')
      .where({ roll_id: line.roll_id }).whereIn('status', ACTIVE_ITEM_STATUSES).first('id');
    const untouched =
      !reservedAgain &&
      line.warehouse === expectedWarehouse &&
      line.roll_status === 'in_stock' &&
      last?.event_type === expectedEvent &&
      last?.reference_type === 'shipment' &&
      Number(last?.reference_id) === shipmentId;
    if (!untouched) {
      throw Object.assign(new Error('LINE_UNDO_NOT_ALLOWED'), { barcodes: [line.internal_barcode] });
    }

    await trx('rolls').where({ id: line.roll_id }).update({
      warehouse: 'factory',
      status: 'in_transit',
      ...(accepted ? { received_at: null } : {}),
      updated_at: trx.fn.now(),
    });
    await trx('stock_movements').insert({
      roll_id: line.roll_id,
      from_warehouse: expectedWarehouse,
      to_warehouse: null,
      event_type: 'shipment_out',
      reference_type: 'shipment',
      reference_id: shipmentId,
      actor_user_id: actorUserId,
      notes_ar: accepted ? 'تراجع عن قبول' : 'تراجع عن رفض',
    });
  }
}

/**
 * Close the طلبية once no توب is still awaiting review. Stock already moved
 * line by line; this only fixes the final status and notifies the owner.
 */
async function finalizeIfComplete(trx: Knex.Transaction, shipment: Shipment, actorUserId: number): Promise<Shipment> {
  const lines: Array<{ status: string }> = await trx('shipment_lines').where({ shipment_id: shipment.id }).select('status');
  if (lines.length === 0 || lines.some((l) => l.status === 'pending')) {
    return trx('shipments').where({ id: shipment.id }).first() as Promise<Shipment>;
  }
  const acceptedCount = lines.filter((l) => l.status === 'accepted').length;
  const rejectedCount = lines.length - acceptedCount;

  let finalStatus: 'approved' | 'rejected' | 'partial_approved';
  if (rejectedCount === 0) finalStatus = 'approved';
  else if (acceptedCount === 0) finalStatus = 'rejected';
  else finalStatus = 'partial_approved';

  await trx('shipments').where({ id: shipment.id }).update({
    status: finalStatus,
    reviewed_by_user_id: actorUserId,
    reviewed_at: trx.fn.now(),
    updated_at: trx.fn.now(),
  });
  const updated = await trx('shipments').where({ id: shipment.id }).first();

  await auditFromService(trx, {
    actorUserId,
    action: 'finalize_shipment',
    entity: 'shipment',
    entityId: shipment.id,
    before: { status: shipment.status },
    after: { status: finalStatus, accepted_count: acceptedCount, rejected_count: rejectedCount },
    severity: finalStatus === 'approved' ? 'medium' : 'high',
  });

  if (finalStatus === 'partial_approved' || finalStatus === 'rejected') {
    await notify({
      recipientRole: 'owner',
      severity: 'medium',
      eventType: 'shipment_partial_reject',
      titleAr: 'طلبية مرفوضة جزئياً',
      bodyAr: `طلبية رقم ${updated.shipment_no}: قُبل ${acceptedCount} ورُفض ${rejectedCount} توب`,
      payload: { shipment_id: shipment.id, shipment_no: updated.shipment_no, final_status: finalStatus, accepted: acceptedCount, rejected: rejectedCount },
    });
  }

  return updated as Shipment;
}

/**
 * Insert an empty draft طلبية inside the caller's transaction. Shared by the
 * manual flow (createDraft) and the stock-request flow, which passes the
 * request the draft is fulfilling. Behaviour for manual drafts is unchanged.
 */
export async function insertDraft(
  trx: Knex.Transaction,
  actorUserId: number,
  notesAr: string | null | undefined,
  stockRequestId: number | null = null,
): Promise<Shipment> {
  const year = new Date().getFullYear();
  const shipment_no = await nextShipmentNo(trx, year);
  const [{ id }] = await trx('shipments').insert({
    shipment_no,
    created_by_user_id: actorUserId,
    status: 'draft',
    notes_ar: notesAr ?? null,
    ...(stockRequestId !== null ? { stock_request_id: stockRequestId } : {}),
  }).returning('id');
  const row = await trx('shipments').where({ id }).first();
  await auditFromService(trx, {
    actorUserId,
    action: 'create_shipment_draft',
    entity: 'shipment',
    entityId: row.id,
    after: { shipment_no, status: 'draft', ...(stockRequestId !== null ? { stock_request_id: stockRequestId } : {}) },
    severity: 'low',
  });
  return row as Shipment;
}

export async function createDraft(actorUserId: number, input: CreateShipmentDraftInput): Promise<Shipment> {
  return db.transaction((trx) => insertDraft(trx, actorUserId, input.notes_ar));
}

export async function addRoll(
  shipmentId: number,
  actorUserId: number,
  input: AddShipmentRollInput,
): Promise<{ shipment: Shipment; line: ShipmentLine; rollId: number }> {
  return db.transaction(async (trx) => {
    const shipment = await trx('shipments').where({ id: shipmentId }).first();
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND');
    if (shipment.status !== 'draft') throw new Error('SHIPMENT_NOT_DRAFT');
    if (Number(shipment.created_by_user_id) !== actorUserId) throw new Error('SHIPMENT_FORBIDDEN');

    const rollQuery = trx('rolls').forUpdate();
    if (input.roll_id !== undefined) {
      rollQuery.where({ id: input.roll_id });
    } else {
      rollQuery.where((b) =>
        b.where('internal_barcode', input.internal_barcode!)
          .orWhere('external_barcode', input.internal_barcode!),
      );
    }
    const roll = await rollQuery.first();
    if (!roll) throw new Error('ROLL_NOT_FOUND');

    // Stock-request guard. Lock order: roll (above) -> request item.
    //  - request shipment: only a top the shop REQUESTED (and nobody has taken) may be scanned;
    //  - manual shipment: a top reserved by a request may not be sent outside it.
    let requestItem: { id: number; request_id: number } | undefined;
    if (shipment.stock_request_id) {
      requestItem = await trx('stock_request_items')
        .where({ request_id: shipment.stock_request_id, roll_id: roll.id, status: 'requested' })
        .forNoKeyUpdate()
        .first('id', 'request_id');
      if (!requestItem) {
        const alreadyPacked = await trx('stock_request_items')
          .where({ request_id: shipment.stock_request_id, roll_id: roll.id, shipment_id: shipmentId, status: 'packing' })
          .first('id');
        throw new Error(alreadyPacked ? 'ROLL_ALREADY_SCANNED' : 'ROLL_NOT_IN_REQUEST');
      }
    } else {
      const reserved = await trx('stock_request_items').where({ roll_id: roll.id }).whereIn('status', ACTIVE_ITEM_STATUSES).first('id');
      if (reserved) throw new Error('ROLL_RESERVED_FOR_REQUEST');
    }

    if (roll.warehouse !== 'factory') throw new Error('ROLL_NOT_IN_FACTORY');
    if (roll.status !== 'in_stock') throw new Error('ROLL_NOT_AVAILABLE');

    // acceptShipment refuses metre أتواب without a length, and once added the
    // توب is locked «قيد الشحن» — so the length must be fixed before, not after.
    const fabric = await trx('fabrics').where({ id: roll.fabric_id }).first('unit');
    if (fabric?.unit === 'meter' && (roll.length_m === null || roll.length_m === undefined)) {
      throw new Error('ROLL_MISSING_LENGTH');
    }

    // Block if روول is already attached to any active shipment line.
    const conflicting = await trx('shipment_lines as sl')
      .join('shipments as s', 'sl.shipment_id', 's.id')
      .where('sl.roll_id', roll.id)
      .where('sl.status', 'pending')
      .whereIn('s.status', ACTIVE_SHIPMENT_STATUSES)
      .first();
    if (conflicting) throw new Error('ROLL_ALREADY_IN_SHIPMENT');

    const [{ id: lineId }] = await trx('shipment_lines').insert({
      shipment_id: shipmentId,
      roll_id: roll.id,
      status: 'pending',
    }).returning('id');
    const line = await trx('shipment_lines').where({ id: lineId }).first();

    if (requestItem) {
      await trx('stock_request_items').where({ id: requestItem.id }).update({
        status: 'packing', shipment_id: shipmentId, shipment_line_id: line.id, updated_at: trx.fn.now(),
      });
      await logItemEvent(trx, {
        itemId: Number(requestItem.id), requestId: Number(requestItem.request_id), eventType: 'packed',
        fromStatus: 'requested', toStatus: 'packing', actorUserId, shipmentId, shipmentLineId: Number(line.id),
      });
      await auditFromService(trx, {
        actorUserId, action: 'pack_request_item', entity: 'stock_request_item', entityId: requestItem.id,
        after: { shipment_id: shipmentId, line_id: line.id, roll_id: roll.id, internal_barcode: roll.internal_barcode }, severity: 'low',
      });
    }

    // Locked «قيد الشحن» from here until the shop reviews it.
    await trx('rolls').where({ id: roll.id }).update({ status: 'in_transit', updated_at: trx.fn.now() });

    await auditFromService(trx, {
      actorUserId,
      action: 'add_roll_to_shipment',
      entity: 'shipment',
      entityId: shipmentId,
      after: { line_id: line.id, roll_id: roll.id, internal_barcode: roll.internal_barcode, roll_status: 'in_transit' },
      severity: 'low',
    });

    await trx('shipments').where({ id: shipmentId }).update({ updated_at: trx.fn.now() });
    const updated = await trx('shipments').where({ id: shipmentId }).first();
    return { shipment: updated as Shipment, line: line as ShipmentLine, rollId: roll.id };
  });
}

export async function removeLine(shipmentId: number, lineId: number, actorUserId: number): Promise<void> {
  await db.transaction(async (trx) => {
    const shipment = await trx('shipments').where({ id: shipmentId }).first();
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND');
    if (shipment.status !== 'draft') throw new Error('SHIPMENT_NOT_DRAFT');
    if (Number(shipment.created_by_user_id) !== actorUserId) throw new Error('SHIPMENT_FORBIDDEN');

    const line = await trx('shipment_lines').where({ id: lineId, shipment_id: shipmentId }).first();
    if (!line) throw new Error('LINE_NOT_FOUND');

    if (shipment.stock_request_id) {
      await unpackRequestItems(trx, { shipment_line_id: lineId }, actorUserId, 'أُزيل من الشحنة');
    }
    await trx('shipment_lines').where({ id: lineId }).delete();
    await releaseRolls(trx, [Number(line.roll_id)]);

    await auditFromService(trx, {
      actorUserId,
      action: 'remove_shipment_line',
      entity: 'shipment',
      entityId: shipmentId,
      before: { line_id: lineId, roll_id: line.roll_id, roll_status: 'in_transit' },
      after: { roll_status: 'in_stock' },
      severity: 'low',
    });
  });
}

export async function deleteDraft(shipmentId: number, actorUserId: number): Promise<void> {
  await db.transaction(async (trx) => {
    const shipment = await trx('shipments').where({ id: shipmentId }).first();
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND');
    if (shipment.status !== 'draft') throw new Error('SHIPMENT_NOT_DRAFT');
    if (Number(shipment.created_by_user_id) !== actorUserId) throw new Error('SHIPMENT_FORBIDDEN');

    const lines = await trx('shipment_lines').where({ shipment_id: shipmentId });
    if (shipment.stock_request_id) {
      await unpackRequestItems(trx, { shipment_id: shipmentId }, actorUserId, 'حُذفت الشحنة المسودة');
    }
    await trx('shipment_lines').where({ shipment_id: shipmentId }).delete();
    await trx('shipments').where({ id: shipmentId }).delete();
    await releaseRolls(trx, lines.map((l: { roll_id: number }) => Number(l.roll_id)));

    await auditFromService(trx, {
      actorUserId,
      action: 'delete_shipment_draft',
      entity: 'shipment',
      entityId: shipmentId,
      before: {
        shipment_no: shipment.shipment_no,
        status: shipment.status,
        line_count: lines.length,
      },
      severity: 'medium',
    });
  });
}

export async function submit(shipmentId: number, actorUserId: number): Promise<Shipment> {
  return db.transaction(async (trx) => {
    const shipment = await trx('shipments').where({ id: shipmentId }).first();
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND');
    if (shipment.status !== 'draft') throw new Error('SHIPMENT_NOT_DRAFT');
    if (Number(shipment.created_by_user_id) !== actorUserId) throw new Error('SHIPMENT_FORBIDDEN');

    const lines = await trx('shipment_lines').where({ shipment_id: shipmentId });
    if (lines.length === 0) throw new Error('SHIPMENT_EMPTY');

    for (const line of lines) {
      await trx('stock_movements').insert({
        roll_id: line.roll_id,
        from_warehouse: 'factory',
        to_warehouse: null,
        event_type: 'shipment_out',
        reference_type: 'shipment',
        reference_id: shipmentId,
        actor_user_id: actorUserId,
      });
    }

    const requestNo = shipment.stock_request_id
      ? await dispatchRequestItems(trx, shipment as Shipment & { stock_request_id: number }, lines.length, actorUserId)
      : null;

    const now = trx.fn.now();
    await trx('shipments').where({ id: shipmentId }).update({ status: 'pending_approval', submitted_at: now, updated_at: now });
    const updated = await trx('shipments').where({ id: shipmentId }).first();

    await auditFromService(trx, {
      actorUserId,
      action: 'submit_shipment',
      entity: 'shipment',
      entityId: shipmentId,
      before: { status: 'draft' },
      after: { status: 'pending_approval', line_count: lines.length },
      severity: 'medium',
    });

    await notify({
      recipientRole: 'shop_seller',
      severity: 'medium',
      eventType: 'shipment_arrived',
      titleAr: 'طلبية جديدة للمراجعة',
      bodyAr: `طلبية رقم ${updated.shipment_no}${requestNo ? ` (للطلب ${requestNo})` : ''} تحتوي على ${lines.length} توب في انتظار المراجعة`,
      payload: { shipment_id: shipmentId, shipment_no: updated.shipment_no, line_count: lines.length, ...(requestNo ? { request_no: requestNo, stock_request_id: shipment.stock_request_id } : {}) },
    });

    return updated as Shipment;
  });
}

export async function reviewLine(
  shipmentId: number,
  lineId: number,
  actorUserId: number,
  action: 'accept' | 'reject',
  rejectReason?: string | null,
): Promise<ShipmentLine> {
  const [updated] = await reviewLines(shipmentId, actorUserId, {
    line_ids: [lineId],
    action,
    reject_reason_ar: rejectReason,
  });
  return updated;
}

/**
 * Review several lines at once. A decision takes effect immediately — the
 * طلبية may arrive in several deliveries, so the shop accepts what came and
 * leaves the rest pending:
 *  - accept: the توب is received into the shop warehouse now;
 *  - reject: the توب goes back to the factory now;
 *  - reset (undo): reverses a decision while the توب is still untouched.
 * accept/reject apply only to lines still pending (so «قبول الكل» never
 * overrides a decision already taken). When no line is left pending the
 * طلبية closes on its own.
 */
export async function reviewLines(
  shipmentId: number,
  actorUserId: number,
  input: BulkReviewShipmentLinesInput,
): Promise<ShipmentLine[]> {
  return db.transaction(async (trx) => {
    const shipment = await trx('shipments').where({ id: shipmentId }).forUpdate().first();
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND');
    if (shipment.status !== 'pending_approval') throw new Error('SHIPMENT_NOT_REVIEWABLE');

    const lines: ReviewLineRow[] = await trx('shipment_lines as sl')
      .join('rolls as r', 'sl.roll_id', 'r.id')
      .join('fabrics as f', 'r.fabric_id', 'f.id')
      .where('sl.shipment_id', shipmentId)
      .whereIn('sl.id', input.line_ids)
      .forUpdate('sl', 'r')
      .select('sl.*', 'r.internal_barcode', 'r.warehouse', 'r.status as roll_status', 'r.length_m', 'f.unit as fabric_unit');
    if (lines.length !== input.line_ids.length) throw new Error('LINE_NOT_FOUND');

    const targets = lines.filter((l) =>
      input.action === 'reset' ? l.status !== 'pending' : l.status === 'pending',
    );
    if (targets.length === 0) {
      // Single-line callers keep the historical error code.
      throw new Error(input.line_ids.length === 1 && input.action !== 'reset' ? 'LINE_ALREADY_REVIEWED' : 'NOTHING_TO_REVIEW');
    }

    // Only a توب still «جاري الشحن» in the factory can be received or sent
    // back — anything else would write a stock movement for stock that never
    // left, or count it into the shop twice.
    if (input.action !== 'reset') {
      const notInTransit = targets.filter((l) => l.roll_status !== 'in_transit' || l.warehouse !== 'factory');
      if (notInTransit.length > 0) {
        throw Object.assign(new Error('ROLL_NOT_IN_TRANSIT'), { barcodes: notInTransit.map((l) => l.internal_barcode) });
      }
    }

    const newStatus = input.action === 'accept' ? 'accepted' : input.action === 'reject' ? 'rejected' : 'pending';
    const reason = input.action === 'reject' ? (input.reject_reason_ar?.trim() || null) : null;
    const targetIds = targets.map((l) => l.id);

    if (input.action === 'accept') await receiveLines(trx, shipmentId, targets, actorUserId);
    else if (input.action === 'reject') await returnLinesToFactory(trx, shipmentId, targets, reason, actorUserId);
    else await undoLines(trx, shipmentId, targets, actorUserId);

    await trx('shipment_lines').whereIn('id', targetIds).update({
      status: newStatus,
      reject_reason_ar: reason,
      updated_at: trx.fn.now(),
    });

    const rollWarehouse = input.action === 'accept' ? 'shop' : 'factory';
    const rollStatus = input.action === 'reset' ? 'in_transit' : 'in_stock';
    for (const line of targets) {
      await auditFromService(trx, {
        actorUserId,
        action: input.action === 'reset' ? 'reset_shipment_line_review' : 'review_shipment_line',
        entity: 'shipment_line',
        entityId: line.id,
        before: { status: line.status, reject_reason_ar: line.reject_reason_ar, roll_warehouse: line.warehouse, roll_status: line.roll_status },
        after: { status: newStatus, reject_reason_ar: reason, roll_warehouse: rollWarehouse, roll_status: rollStatus },
        severity: 'medium',
      });
    }

    await trx('shipments').where({ id: shipmentId }).update({ updated_at: trx.fn.now() });
    await finalizeIfComplete(trx, shipment as Shipment, actorUserId);

    if (shipment.stock_request_id) {
      await recordLinkedReview(trx, Number(shipment.stock_request_id), targetIds, input.action, reason, actorUserId);
    }

    return trx('shipment_lines').whereIn('id', targetIds).orderBy('id') as Promise<ShipmentLine[]>;
  });
}

/**
 * Kept for API compatibility. Stock now moves when each line is reviewed and
 * the طلبية closes itself once nothing is pending; this only re-runs that
 * closing check.
 */
export async function acceptShipment(
  shipmentId: number,
  actorUserId: number,
  _input: AcceptShipmentInput,
): Promise<Shipment> {
  return db.transaction(async (trx) => {
    // Locked so a double-click cannot finalize the same طلبية twice.
    const shipment = await trx('shipments').where({ id: shipmentId }).forUpdate().first();
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND');
    if (shipment.status !== 'pending_approval') throw new Error('SHIPMENT_NOT_REVIEWABLE');

    const pending = await trx('shipment_lines').where({ shipment_id: shipmentId, status: 'pending' }).first('id');
    if (pending) throw new Error('REVIEW_INCOMPLETE');
    const any = await trx('shipment_lines').where({ shipment_id: shipmentId }).first('id');
    if (!any) throw new Error('SHIPMENT_EMPTY');

    return finalizeIfComplete(trx, shipment as Shipment, actorUserId);
  });
}

export async function listShipments(filters: ListShipmentsQueryInput): Promise<Shipment[]> {
  const q = db('shipments as s')
    .leftJoin('stock_requests as sreq', 'sreq.id', 's.stock_request_id')
    .select(
      's.*',
      'sreq.request_no',
      db.raw('(SELECT COUNT(*)::int FROM shipment_lines sl WHERE sl.shipment_id = s.id) AS line_count'),
      db.raw(`(SELECT COUNT(*)::int FROM shipment_lines sl WHERE sl.shipment_id = s.id AND sl.status = 'accepted') AS accepted_count`),
      db.raw(`(SELECT COUNT(*)::int FROM shipment_lines sl WHERE sl.shipment_id = s.id AND sl.status = 'pending') AS pending_count`),
    )
    .orderBy('s.id', 'desc');
  if (filters.status !== undefined) q.where('s.status', filters.status);
  if (filters.created_by_user_id !== undefined) q.where('s.created_by_user_id', filters.created_by_user_id);
  return q;
}

export async function getShipment(id: number): Promise<ShipmentWithLines | undefined> {
  const shipment = await db('shipments as s')
    .leftJoin('stock_requests as sreq', 'sreq.id', 's.stock_request_id')
    .where('s.id', id)
    .first('s.*', 'sreq.request_no');
  if (!shipment) return undefined;
  const lines = await db('shipment_lines as sl')
    .where('sl.shipment_id', id)
    .join('rolls as r', 'sl.roll_id', 'r.id')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .join('colors as c', 'r.color_id', 'c.id')
    .select(
      'sl.id',
      'sl.shipment_id',
      'sl.roll_id',
      'sl.status',
      'sl.reject_reason_ar',
      'sl.created_at',
      'sl.updated_at',
      'r.fabric_id',
      'f.name_ar as fabric_name_ar',
      'f.unit as fabric_unit',
      'c.name_ar as color_name_ar',
      'c.code as color_code',
      'r.weight_kg',
      'r.length_m',
      'r.reference_price_per_unit',
      'r.internal_barcode',
    )
    .orderBy('r.fabric_id', 'asc')
    .orderBy('sl.id', 'asc');
  return { ...(shipment as Shipment), lines };
}

export async function listFactoryRolls(filters: ListFactoryRollsQueryInput): Promise<Array<{
  id: number;
  internal_barcode: string;
  weight_kg: string | null;
  length_m: string | null;
  fabric_unit: string;
  fabric_id: number;
  color_id: number;
  fabric_name_ar: string;
  color_name_ar: string;
  color_code: string;
  fabric_code: string;
}>> {
  // Active draft/pending shipment_lines that already claim a روول.
  const q = db('rolls as r')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .join('colors as c', 'r.color_id', 'c.id')
    .leftJoin('shipment_lines as sl', function () {
      this.on('sl.roll_id', '=', 'r.id').andOn(
        db.raw(
          `sl.status = 'pending' AND sl.shipment_id IN (SELECT id FROM shipments WHERE status IN ('draft','pending_approval'))`,
        ),
      );
    })
    .whereNull('sl.id')
    .whereNotExists(function () {
      this.select(db.raw('1')).from('stock_request_items as sri')
        .whereRaw('sri.roll_id = r.id')
        .whereIn('sri.status', ACTIVE_ITEM_STATUSES);
    })
    .where('r.warehouse', 'factory')
    .where('r.status', 'in_stock')
    .select(
      'r.id',
      'r.internal_barcode',
      'r.weight_kg',
      'r.length_m',
      'r.fabric_id',
      'r.color_id',
      'f.unit as fabric_unit',
      'f.name_ar as fabric_name_ar',
      'c.name_ar as color_name_ar',
      'c.code as color_code',
      'f.code as fabric_code',
    )
    .orderBy('r.id', 'desc')
    .limit(filters.limit);

  if (filters.fabric_id !== undefined) q.where('r.fabric_id', filters.fabric_id);
  if (filters.color_id !== undefined) q.where('r.color_id', filters.color_id);
  if (filters.q !== undefined && filters.q.length > 0) {
    q.where((b) =>
      b
        .whereILike('r.internal_barcode', `%${filters.q}%`)
        .orWhereILike('r.external_barcode', `%${filters.q}%`)
        .orWhereILike('f.name_ar', `%${filters.q}%`)
        .orWhereILike('c.name_ar', `%${filters.q}%`),
    );
  }
  return q;
}
