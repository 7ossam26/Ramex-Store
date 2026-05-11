import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import { auditFromService } from './audit.helper.js';
import { notify } from '../notifications/notificationsService.js';
import { getSetting } from '../settings/settings.service.js';
import type {
  DamageDisposition,
  DamageEvent,
  DamageReasonCode,
} from './inventory.types.js';
import type {
  CreateDamageEventInput,
  ListDamageEventsQueryInput,
} from './inventory.schemas.js';

const LOSS_CODES: DamageReasonCode[] = ['loss_theft', 'loss_misplaced'];

function isLossCode(code: DamageReasonCode): boolean {
  return LOSS_CODES.includes(code);
}

export async function createDamageEvent(
  actorUserId: number,
  input: CreateDamageEventInput,
): Promise<DamageEvent> {
  return db.transaction(async (trx) => {
    const roll = await trx('rolls').where({ id: input.roll_id }).first();
    if (!roll) throw new Error('ROLL_NOT_FOUND');

    const valuation = Number(roll.selling_price_egp);
    const isLoss = isLossCode(input.reason_code);

    let disposition: DamageDisposition;
    if (isLoss) {
      disposition = 'auto_writeoff';
    } else {
      if (!input.disposition || input.disposition === 'auto_writeoff') {
        throw new Error('DISPOSITION_REQUIRED');
      }
      disposition = input.disposition;
    }

    let requiresApproval = false;
    if (!isLoss) {
      const threshold = await getSetting<number>(trx, 'approval_threshold_egp', 5000);
      if (valuation > threshold) requiresApproval = true;
    }

    const [eventId] = await trx('damage_events').insert({
      roll_id: input.roll_id,
      reason_code: input.reason_code,
      disposition,
      notes_ar: input.notes_ar ?? null,
      photo_path: input.photo_path ?? null,
      valuation_egp: valuation,
      requires_approval: requiresApproval,
      created_by_user_id: actorUserId,
    });
    const event = await trx('damage_events').where({ id: eventId }).first() as DamageEvent;

    if (requiresApproval) {
      await auditFromService(trx, {
        actorUserId,
        action: 'damage_event_pending_approval',
        entity: 'damage_event',
        entityId: event.id,
        after: { roll_id: input.roll_id, reason_code: input.reason_code, disposition, valuation_egp: valuation },
        severity: 'high',
      });
      await notify({
        recipientRole: 'owner',
        severity: 'high',
        eventType: 'approval_needed',
        titleAr: 'طلب موافقة — حدث تلف',
        bodyAr: `حدث تلف على توب #${input.roll_id} بقيمة ${valuation} جنيه يستلزم الموافقة`,
        isBlocking: true,
        blockedActionPayload: { actionType: 'damage_event_high_value', eventId: event.id },
        payload: { damage_event_id: event.id, roll_id: input.roll_id, valuation_egp: valuation },
      });
    } else {
      await applyDamageEvent(trx, event, roll, actorUserId);
    }

    return event;
  });
}

export async function approveDamageEvent(eventId: number, actorUserId: number): Promise<DamageEvent> {
  return db.transaction(async (trx) => {
    const event = await trx('damage_events').where({ id: eventId }).first();
    if (!event) throw new Error('EVENT_NOT_FOUND');
    if (!event.requires_approval) throw new Error('NO_APPROVAL_REQUIRED');
    if (event.approved_at) throw new Error('ALREADY_APPROVED');

    const roll = await trx('rolls').where({ id: event.roll_id }).first();
    if (!roll) throw new Error('ROLL_NOT_FOUND');

    await trx('damage_events').where({ id: eventId }).update({ approved_by_user_id: actorUserId, approved_at: trx.fn.now() });
    const updated = await trx('damage_events').where({ id: eventId }).first() as DamageEvent;

    await applyDamageEvent(trx, updated, roll, actorUserId);
    return updated;
  });
}

export async function rejectDamageEvent(eventId: number, actorUserId: number): Promise<void> {
  await db.transaction(async (trx) => {
    const event = await trx('damage_events').where({ id: eventId }).first();
    if (!event) throw new Error('EVENT_NOT_FOUND');
    if (!event.requires_approval) throw new Error('NO_APPROVAL_REQUIRED');
    if (event.approved_at) throw new Error('ALREADY_APPROVED');

    await trx('damage_events').where({ id: eventId }).delete();
    await auditFromService(trx, {
      actorUserId,
      action: 'damage_event_rejected',
      entity: 'damage_event',
      entityId: eventId,
      before: { reason_code: event.reason_code, disposition: event.disposition },
      severity: 'medium',
    });
  });
}

async function applyDamageEvent(
  trx: Knex.Transaction,
  event: DamageEvent,
  roll: { id: number; status: string; warehouse: string },
  actorUserId: number,
): Promise<void> {
  let newStatus: string;
  let newWarehouse: string;
  let eventType: 'damage' | 'loss_writeoff';
  let toWarehouseForMovement: string | null;

  if (event.disposition === 'auto_writeoff') {
    newStatus = 'written_off';
    newWarehouse = roll.warehouse;
    eventType = 'loss_writeoff';
    toWarehouseForMovement = null;
  } else if (event.disposition === 'damaged_stock') {
    newStatus = 'damaged';
    newWarehouse = 'damaged_shop';
    eventType = 'damage';
    toWarehouseForMovement = newWarehouse;
  } else {
    newStatus = 'returned';
    newWarehouse = 'factory';
    eventType = 'damage';
    toWarehouseForMovement = newWarehouse;
  }

  await trx('rolls').where({ id: roll.id }).update({ status: newStatus, warehouse: newWarehouse, updated_at: trx.fn.now() });

  await trx('stock_movements').insert({
    roll_id: roll.id,
    from_warehouse: roll.warehouse,
    to_warehouse: toWarehouseForMovement,
    event_type: eventType,
    reference_type: 'damage_event',
    reference_id: event.id,
    actor_user_id: actorUserId,
    notes_ar: event.notes_ar,
  });

  const isLoss = isLossCode(event.reason_code);
  await auditFromService(trx, {
    actorUserId,
    action: isLoss ? 'loss_writeoff' : 'damage_apply',
    entity: 'damage_event',
    entityId: event.id,
    before: { roll_status: roll.status, roll_warehouse: roll.warehouse },
    after: { roll_status: newStatus, roll_warehouse: newWarehouse, disposition: event.disposition },
    severity: isLoss ? 'critical' : 'medium',
    tag: isLoss ? 'سرقة' : null,
  });

  if (isLoss) {
    await notify({
      recipientRole: 'owner',
      severity: 'critical',
      eventType: 'theft_detected',
      tag: 'سرقة',
      titleAr: 'تنبيه: سرقة أو فقدان',
      bodyAr: `تم تسجيل فقدان/سرقة توب #${roll.id} بقيمة ${event.valuation_egp} جنيه`,
      payload: { damage_event_id: event.id, roll_id: roll.id, reason_code: event.reason_code, valuation_egp: event.valuation_egp },
    });
  } else {
    await notify({
      recipientRole: 'owner',
      severity: 'low',
      eventType: 'damage_loss_logged',
      titleAr: 'تلف مسجل',
      bodyAr: `تم تسجيل حدث تلف على توب #${roll.id} بقيمة ${event.valuation_egp} جنيه`,
      payload: { damage_event_id: event.id, roll_id: roll.id, reason_code: event.reason_code, disposition: event.disposition, valuation_egp: event.valuation_egp },
    });
  }
}

export async function listDamageEvents(filters: ListDamageEventsQueryInput): Promise<DamageEvent[]> {
  const q = db('damage_events').orderBy('id', 'desc');
  if (filters.roll_id !== undefined) q.where('roll_id', filters.roll_id);
  if (filters.reason_code !== undefined) q.where('reason_code', filters.reason_code);
  if (filters.requires_approval !== undefined) q.where('requires_approval', filters.requires_approval);
  return q;
}

export async function getDamageEvent(id: number): Promise<DamageEvent | undefined> {
  return db('damage_events').where({ id }).first();
}
