import { db } from '../../db/connection.js';
import { nextShipmentNo } from './shipmentNumber.service.js';
import { auditFromService } from './audit.helper.js';
import { notify } from '../notifications/notificationsService.js';
import { insertInvoice } from '../treasury/suppliers/suppliers.repository.js';
import type {
  Shipment,
  ShipmentLine,
  ShipmentWithLines,
} from './inventory.types.js';
import type {
  AcceptShipmentInput,
  AddShipmentRollInput,
  CreateShipmentDraftInput,
  ListFactoryRollsQueryInput,
  ListShipmentsQueryInput,
} from './inventory.schemas.js';

export async function createDraft(actorUserId: number, input: CreateShipmentDraftInput): Promise<Shipment> {
  return db.transaction(async (trx) => {
    const year = new Date().getFullYear();
    const shipment_no = await nextShipmentNo(trx, year);
    const [{ id }] = await trx('shipments').insert({
      shipment_no,
      created_by_user_id: actorUserId,
      status: 'draft',
      notes_ar: input.notes_ar ?? null,
      supplier_id: input.supplier_id ?? null,
    }).returning('id');
    const row = await trx('shipments').where({ id }).first();
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
    if (roll.warehouse !== 'factory') throw new Error('ROLL_NOT_IN_FACTORY');
    if (roll.status !== 'in_stock') throw new Error('ROLL_NOT_AVAILABLE');

    // Block if روول is already attached to any active shipment line (draft or pending or partial_approved).
    const conflicting = await trx('shipment_lines as sl')
      .join('shipments as s', 'sl.shipment_id', 's.id')
      .where('sl.roll_id', roll.id)
      .whereIn('s.status', ['draft', 'pending_approval', 'partial_approved'])
      .first();
    if (conflicting) throw new Error('ROLL_ALREADY_IN_SHIPMENT');

    const [{ id: lineId }] = await trx('shipment_lines').insert({
      shipment_id: shipmentId,
      roll_id: roll.id,
      status: 'pending',
    }).returning('id');
    const line = await trx('shipment_lines').where({ id: lineId }).first();

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

export async function removeLine(shipmentId: number, lineId: number, actorUserId: number): Promise<void> {
  await db.transaction(async (trx) => {
    const shipment = await trx('shipments').where({ id: shipmentId }).first();
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND');
    if (shipment.status !== 'draft') throw new Error('SHIPMENT_NOT_DRAFT');
    if (Number(shipment.created_by_user_id) !== actorUserId) throw new Error('SHIPMENT_FORBIDDEN');

    const line = await trx('shipment_lines').where({ id: lineId, shipment_id: shipmentId }).first();
    if (!line) throw new Error('LINE_NOT_FOUND');

    await trx('shipment_lines').where({ id: lineId }).delete();

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

export async function deleteDraft(shipmentId: number, actorUserId: number): Promise<void> {
  await db.transaction(async (trx) => {
    const shipment = await trx('shipments').where({ id: shipmentId }).first();
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND');
    if (shipment.status !== 'draft') throw new Error('SHIPMENT_NOT_DRAFT');
    if (Number(shipment.created_by_user_id) !== actorUserId) throw new Error('SHIPMENT_FORBIDDEN');

    const lines = await trx('shipment_lines').where({ shipment_id: shipmentId });
    await trx('shipment_lines').where({ shipment_id: shipmentId }).delete();
    await trx('shipments').where({ id: shipmentId }).delete();

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
      bodyAr: `طلبية رقم ${updated.shipment_no} تحتوي على ${lines.length} توب في انتظار المراجعة`,
      payload: { shipment_id: shipmentId, shipment_no: updated.shipment_no, line_count: lines.length },
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

    const line = await trx('shipment_lines').where({ id: lineId, shipment_id: shipmentId }).first();
    if (!line) throw new Error('LINE_NOT_FOUND');
    if (line.status !== 'pending') throw new Error('LINE_ALREADY_REVIEWED');

    const newStatus: 'accepted' | 'rejected' = action === 'accept' ? 'accepted' : 'rejected';
    await trx('shipment_lines').where({ id: lineId }).update({
      status: newStatus,
      reject_reason_ar: action === 'reject' ? (rejectReason ?? null) : null,
      updated_at: trx.fn.now(),
    });
    const updated = await trx('shipment_lines').where({ id: lineId }).first();

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

export async function acceptShipment(
  shipmentId: number,
  actorUserId: number,
  _input: AcceptShipmentInput,
): Promise<Shipment> {
  return db.transaction(async (trx) => {
    const shipment = await trx('shipments').where({ id: shipmentId }).first();
    if (!shipment) throw new Error('SHIPMENT_NOT_FOUND');
    if (shipment.status !== 'pending_approval' && shipment.status !== 'partial_approved') {
      throw new Error('SHIPMENT_NOT_REVIEWABLE');
    }

    const lines = await trx('shipment_lines as sl')
      .join('rolls as r', 'sl.roll_id', 'r.id')
      .join('fabrics as f', 'r.fabric_id', 'f.id')
      .where('sl.shipment_id', shipmentId)
      .select('sl.*', 'r.fabric_id', 'r.length_m', 'r.weight_kg', 'r.reference_price_per_unit', 'f.unit as fabric_unit');

    if (lines.length === 0) throw new Error('SHIPMENT_EMPTY');
    if (lines.some((l: Record<string, unknown>) => l.status === 'pending')) throw new Error('REVIEW_INCOMPLETE');

    const accepted = lines.filter((l: Record<string, unknown>) => l.status === 'accepted');
    const rejected = lines.filter((l: Record<string, unknown>) => l.status === 'rejected');

    const meterRollsWithNullLength = accepted.filter(
      (l: Record<string, unknown>) => l.fabric_unit === 'meter' && (l.length_m === null || l.length_m === undefined),
    );
    if (meterRollsWithNullLength.length > 0) {
      const barcodes = await trx('rolls')
        .whereIn('id', meterRollsWithNullLength.map((l: Record<string, unknown>) => l.roll_id as number))
        .pluck('internal_barcode');
      throw Object.assign(new Error('METER_ROLL_MISSING_LENGTH'), { barcodes });
    }

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

    let finalStatus: 'approved' | 'rejected' | 'partial_approved';
    if (rejected.length === 0) finalStatus = 'approved';
    else if (accepted.length === 0) finalStatus = 'rejected';
    else finalStatus = 'partial_approved';

    await trx('shipments').where({ id: shipmentId }).update({
      status: finalStatus,
      reviewed_by_user_id: actorUserId,
      reviewed_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });
    const updated = await trx('shipments').where({ id: shipmentId }).first();

    await auditFromService(trx, {
      actorUserId,
      action: 'finalize_shipment',
      entity: 'shipment',
      entityId: shipmentId,
      before: { status: shipment.status },
      after: { status: finalStatus, accepted_count: accepted.length, rejected_count: rejected.length },
      severity: finalStatus === 'approved' ? 'medium' : 'high',
    });

    // Auto-create supplier invoice if shipment has a supplier and any lines were accepted
    if (shipment.supplier_id && accepted.length > 0) {
      const invoiceTotal = accepted.reduce((sum: number, l: Record<string, unknown>) => {
        const price = Number(l.reference_price_per_unit ?? 0);
        if (price === 0) return sum;
        const qty = l.fabric_unit === 'kg'
          ? Number(l.weight_kg ?? 0)
          : Number(l.length_m ?? 0);
        return sum + price * qty;
      }, 0);

      if (invoiceTotal > 0) {
        const inv = await insertInvoice(trx, {
          supplier_id: shipment.supplier_id,
          invoice_no: updated.shipment_no,
          invoice_date: new Date().toISOString().slice(0, 10),
          amount_egp: invoiceTotal,
          notes_ar: null,
          source: 'shipment_receive',
          source_ref: shipmentId,
          created_by_user_id: actorUserId,
        });
        await auditFromService(trx, {
          actorUserId,
          action: 'supplier_invoice_created',
          entity: 'supplier_invoice',
          entityId: inv.id,
          after: { supplier_id: shipment.supplier_id, amount_egp: invoiceTotal, source: 'shipment_receive', source_ref: shipmentId },
          severity: 'medium',
        });
      }
    }

    if (finalStatus === 'partial_approved' || finalStatus === 'rejected') {
      await notify({
        recipientRole: 'owner',
        severity: 'medium',
        eventType: 'shipment_partial_reject',
        titleAr: 'طلبية مرفوضة جزئياً',
        bodyAr: `طلبية رقم ${updated.shipment_no}: قُبل ${accepted.length} ورُفض ${rejected.length} توب`,
        payload: { shipment_id: shipmentId, shipment_no: updated.shipment_no, final_status: finalStatus, accepted: accepted.length, rejected: rejected.length },
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
  weight_kg: string;
  fabric_id: number;
  color_id: number;
  fabric_name_ar: string;
  color_name_ar: string;
  color_code: string;
  fabric_code: string;
}>> {
  // Active draft/pending/partial shipment_lines that already claim a روول.
  const q = db('rolls as r')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .join('colors as c', 'r.color_id', 'c.id')
    .leftJoin('shipment_lines as sl', function () {
      this.on('sl.roll_id', '=', 'r.id').andOn(
        db.raw(
          `sl.shipment_id IN (SELECT id FROM shipments WHERE status IN ('draft','pending_approval','partial_approved'))`,
        ),
      );
    })
    .whereNull('sl.id')
    .where('r.warehouse', 'factory')
    .where('r.status', 'in_stock')
    .select(
      'r.id',
      'r.internal_barcode',
      'r.weight_kg',
      'r.fabric_id',
      'r.color_id',
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
