import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import { nextShipmentNo } from './shipmentNumber.service.js';
import { auditFromService } from './audit.helper.js';
import { notify } from './notifications.service.js';
import type {
  Shipment,
  ShipmentLine,
  ShipmentWithLines,
} from './inventory.types.js';
import type {
  AddShipmentRollInput,
  CreateShipmentDraftInput,
  ListShipmentsQueryInput,
} from './inventory.schemas.js';

async function generateRollBarcode(trx: Knex.Transaction): Promise<string> {
  const r = await trx.raw<{ rows: Array<{ n: string }> }>(
    `SELECT nextval('roll_barcode_seq') AS n`,
  );
  return `RMX-R-${String(Number(r.rows[0].n)).padStart(6, '0')}`;
}

export async function createDraft(
  actorUserId: number,
  input: CreateShipmentDraftInput,
): Promise<Shipment> {
  return db.transaction(async (trx) => {
    const year = new Date().getFullYear();
    const shipment_no = await nextShipmentNo(trx, year);
    const [row] = await trx('shipments')
      .insert({
        shipment_no,
        created_by_user_id: actorUserId,
        status: 'draft',
        notes_ar: input.notes_ar ?? null,
      })
      .returning('*');
    await auditFromService(trx, {
      actorUserId,
      action: 'create_shipment_draft',
      entity: 'shipment',
      entityId: row.id,
      after: { shipment_no, status: 'draft' },
      severity: 'low',
    });
    return row as Shipment;
  });
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
    if (shipment.created_by_user_id !== actorUserId) throw new Error('SHIPMENT_FORBIDDEN');

    const priceRow = await trx('fabric_color_prices')
      .where({ fabric_id: input.fabric_id, color_id: input.color_id })
      .first();
    if (!priceRow) throw new Error('NO_DEFAULT_PRICE');
    const sellingPrice = Number(priceRow.default_price_per_kg);

    const internal_barcode = await generateRollBarcode(trx);
    const [roll] = await trx('rolls')
      .insert({
        internal_barcode,
        external_barcode: input.external_barcode ?? null,
        fabric_id: input.fabric_id,
        color_id: input.color_id,
        roll_sr_no: input.roll_sr_no ?? null,
        order_no: input.order_no ?? null,
        weight_kg: input.weight_kg,
        purchase_price_egp: input.factory_purchase_price_egp ?? null,
        selling_price_egp: sellingPrice,
        warehouse: 'factory',
        status: 'in_stock',
      })
      .returning('*');

    const [line] = await trx('shipment_lines')
      .insert({
        shipment_id: shipmentId,
        roll_id: roll.id,
        factory_purchase_price_egp: input.factory_purchase_price_egp ?? null,
        status: 'pending',
      })
      .returning('*');

    await trx('stock_movements').insert({
      roll_id: roll.id,
      from_warehouse: null,
      to_warehouse: 'factory',
      event_type: 'factory_in',
      reference_type: 'shipment',
      reference_id: shipmentId,
      actor_user_id: actorUserId,
    });

    await auditFromService(trx, {
      actorUserId,
      action: 'add_roll_to_shipment',
      entity: 'shipment',
      entityId: shipmentId,
      after: { line_id: line.id, roll_id: roll.id, internal_barcode: roll.internal_barcode },
      severity: 'low',
    });

    await trx('shipments').where({ id: shipmentId }).update({ updated_at: trx.fn.now() });
    const updated = await trx('shipments').where({ id: shipmentId }).first();
    return { shipment: updated as Shipment, line: line as ShipmentLine, rollId: roll.id };
  });
}

export async function removeLine(
  shipmentId: number,
  lineId: number,
  actorUserId: number,
): Promise<void> {
  await db.transaction(async (trx) => {
    const shipment = await trx('shipments').where({ id: shipmentId }).first();
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND');
    if (shipment.status !== 'draft') throw new Error('SHIPMENT_NOT_DRAFT');
    if (shipment.created_by_user_id !== actorUserId) throw new Error('SHIPMENT_FORBIDDEN');

    const line = await trx('shipment_lines').where({ id: lineId, shipment_id: shipmentId }).first();
    if (!line) throw new Error('LINE_NOT_FOUND');

    // Drop the roll and the line. The factory_in stock_movement is also removed for clean ledger.
    await trx('shipment_lines').where({ id: lineId }).delete();
    await trx('stock_movements')
      .where({ roll_id: line.roll_id, reference_type: 'shipment', reference_id: shipmentId })
      .delete();
    await trx('rolls').where({ id: line.roll_id }).delete();

    await auditFromService(trx, {
      actorUserId,
      action: 'remove_shipment_line',
      entity: 'shipment',
      entityId: shipmentId,
      before: { line_id: lineId, roll_id: line.roll_id },
      severity: 'low',
    });
  });
}

export async function submit(shipmentId: number, actorUserId: number): Promise<Shipment> {
  return db.transaction(async (trx) => {
    const shipment = await trx('shipments').where({ id: shipmentId }).first();
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND');
    if (shipment.status !== 'draft') throw new Error('SHIPMENT_NOT_DRAFT');
    if (shipment.created_by_user_id !== actorUserId) throw new Error('SHIPMENT_FORBIDDEN');

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

    const now = trx.fn.now();
    const [updated] = await trx('shipments')
      .where({ id: shipmentId })
      .update({ status: 'pending_approval', submitted_at: now, updated_at: now })
      .returning('*');

    await auditFromService(trx, {
      actorUserId,
      action: 'submit_shipment',
      entity: 'shipment',
      entityId: shipmentId,
      before: { status: 'draft' },
      after: { status: 'pending_approval', line_count: lines.length },
      severity: 'medium',
    });

    await notify({ role: 'shop_seller' }, 'medium', 'shipment_arrived', {
      shipment_id: shipmentId,
      shipment_no: updated.shipment_no,
      line_count: lines.length,
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
  return db.transaction(async (trx) => {
    const shipment = await trx('shipments').where({ id: shipmentId }).first();
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND');
    if (shipment.status !== 'pending_approval' && shipment.status !== 'partial_approved') {
      throw new Error('SHIPMENT_NOT_REVIEWABLE');
    }

    const line = await trx('shipment_lines')
      .where({ id: lineId, shipment_id: shipmentId })
      .first();
    if (!line) throw new Error('LINE_NOT_FOUND');
    if (line.status !== 'pending') throw new Error('LINE_ALREADY_REVIEWED');

    const newStatus: 'accepted' | 'rejected' = action === 'accept' ? 'accepted' : 'rejected';
    const [updated] = await trx('shipment_lines')
      .where({ id: lineId })
      .update({
        status: newStatus,
        reject_reason_ar: action === 'reject' ? (rejectReason ?? null) : null,
        updated_at: trx.fn.now(),
      })
      .returning('*');

    await auditFromService(trx, {
      actorUserId,
      action: 'review_shipment_line',
      entity: 'shipment_line',
      entityId: lineId,
      before: { status: 'pending' },
      after: { status: newStatus, reject_reason_ar: updated.reject_reason_ar },
      severity: 'medium',
    });

    return updated as ShipmentLine;
  });
}

export async function finalizeReview(
  shipmentId: number,
  actorUserId: number,
): Promise<Shipment> {
  return db.transaction(async (trx) => {
    const shipment = await trx('shipments').where({ id: shipmentId }).first();
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND');
    if (shipment.status !== 'pending_approval' && shipment.status !== 'partial_approved') {
      throw new Error('SHIPMENT_NOT_REVIEWABLE');
    }

    const lines = await trx('shipment_lines').where({ shipment_id: shipmentId });
    if (lines.length === 0) throw new Error('SHIPMENT_EMPTY');
    if (lines.some((l) => l.status === 'pending')) throw new Error('REVIEW_INCOMPLETE');

    const accepted = lines.filter((l) => l.status === 'accepted');
    const rejected = lines.filter((l) => l.status === 'rejected');

    let finalStatus: 'approved' | 'rejected' | 'partial_approved';
    if (rejected.length === 0) finalStatus = 'approved';
    else if (accepted.length === 0) finalStatus = 'rejected';
    else finalStatus = 'partial_approved';

    for (const line of accepted) {
      await trx('rolls').where({ id: line.roll_id }).update({
        warehouse: 'shop',
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
    for (const line of rejected) {
      await trx('stock_movements').insert({
        roll_id: line.roll_id,
        from_warehouse: null,
        to_warehouse: 'factory',
        event_type: 'shipment_reject_back',
        reference_type: 'shipment',
        reference_id: shipmentId,
        actor_user_id: actorUserId,
        notes_ar: line.reject_reason_ar,
      });
    }

    const [updated] = await trx('shipments')
      .where({ id: shipmentId })
      .update({
        status: finalStatus,
        reviewed_by_user_id: actorUserId,
        reviewed_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      })
      .returning('*');

    await auditFromService(trx, {
      actorUserId,
      action: 'finalize_shipment',
      entity: 'shipment',
      entityId: shipmentId,
      before: { status: shipment.status },
      after: {
        status: finalStatus,
        accepted_count: accepted.length,
        rejected_count: rejected.length,
      },
      severity: finalStatus === 'approved' ? 'medium' : 'high',
    });

    if (finalStatus === 'partial_approved' || finalStatus === 'rejected') {
      await notify({ role: 'owner' }, 'medium', 'shipment_partially_rejected', {
        shipment_id: shipmentId,
        shipment_no: updated.shipment_no,
        final_status: finalStatus,
        accepted: accepted.length,
        rejected: rejected.length,
      });
    }

    return updated as Shipment;
  });
}

export async function listShipments(filters: ListShipmentsQueryInput): Promise<Shipment[]> {
  const q = db('shipments').orderBy('id', 'desc');
  if (filters.status !== undefined) q.where('status', filters.status);
  if (filters.created_by_user_id !== undefined) q.where('created_by_user_id', filters.created_by_user_id);
  return q;
}

export async function getShipment(id: number): Promise<ShipmentWithLines | undefined> {
  const shipment = await db('shipments').where({ id }).first();
  if (!shipment) return undefined;
  const lines = await db('shipment_lines as sl')
    .where({ shipment_id: id })
    .join('rolls as r', 'sl.roll_id', 'r.id')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .join('colors as c', 'r.color_id', 'c.id')
    .select(
      'sl.*',
      'f.name_ar as fabric_name_ar',
      'c.name_ar as color_name_ar',
      'c.code as color_code',
      'r.weight_kg',
      'r.internal_barcode',
    )
    .orderBy('sl.id', 'asc');
  return { ...(shipment as Shipment), lines };
}
