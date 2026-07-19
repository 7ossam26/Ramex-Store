import { db } from '../../db/connection.js';
import { auditFromService } from './audit.helper.js';
import { notify } from '../notifications/notificationsService.js';
import type { CreateAdjustmentInput } from './inventory.schemas.js';
import type { StockMovement } from './inventory.types.js';

export async function createAdjustment(
  actorUserId: number,
  input: CreateAdjustmentInput,
): Promise<StockMovement> {
  if (input.entity_type === 'accessory') {
    return createAccessoryAdjustment(actorUserId, input);
  }
  return createRollAdjustment(actorUserId, input);
}

type RollAdjustment = Extract<CreateAdjustmentInput, { entity_type: 'roll' }>;
type AccessoryAdjustment = Extract<CreateAdjustmentInput, { entity_type: 'accessory' }>;

async function createRollAdjustment(
  actorUserId: number,
  input: RollAdjustment,
): Promise<StockMovement> {
  return db.transaction(async (trx) => {
    const roll = await trx('rolls').where({ id: input.roll_id }).first();
    if (!roll) throw new Error('ROLL_NOT_FOUND');

    const fromWarehouse = roll.warehouse;

    // Factory أتواب may only leave the factory via the shipment review flow.
    if (
      input.new_warehouse !== undefined &&
      input.new_warehouse !== fromWarehouse &&
      fromWarehouse === 'factory'
    ) {
      throw new Error('FACTORY_EXIT_REQUIRES_SHIPMENT');
    }

    // Damaged/written-off rolls are permanently deactivated and cannot be re-activated via adjustment.
    const PERMANENT_STATUSES = ['written_off', 'damaged'];
    if (
      PERMANENT_STATUSES.includes(roll.status) &&
      input.new_status !== undefined &&
      !PERMANENT_STATUSES.includes(input.new_status)
    ) {
      throw new Error('CANNOT_REACTIVATE_DAMAGED_ROLL');
    }

    const patch: Record<string, unknown> = { updated_at: trx.fn.now() };
    if (input.new_warehouse !== undefined) patch.warehouse = input.new_warehouse;
    if (input.new_status !== undefined) patch.status = input.new_status;
    if (input.new_weight_kg !== undefined) patch.weight_kg = input.new_weight_kg;

    await trx('rolls').where({ id: roll.id }).update(patch);

    const toWarehouse = input.new_warehouse ?? fromWarehouse;
    const [{ id: movId }] = await trx('stock_movements').insert({
      roll_id: roll.id,
      entity_type: 'roll',
      accessory_id: null,
      from_warehouse: fromWarehouse,
      to_warehouse: toWarehouse,
      event_type: 'adjustment',
      reference_type: 'adjustment',
      reference_id: null,
      actor_user_id: actorUserId,
      notes_ar: input.notes_ar,
    }).returning('id');
    const movement = await trx('stock_movements').where({ id: movId }).first();

    await auditFromService(trx, {
      actorUserId,
      action: 'stock_adjustment',
      entity: 'roll',
      entityId: roll.id,
      before: {
        warehouse: roll.warehouse,
        status: roll.status,
        weight_kg: roll.weight_kg,
      },
      after: {
        warehouse: patch.warehouse ?? roll.warehouse,
        status: patch.status ?? roll.status,
        weight_kg: patch.weight_kg ?? roll.weight_kg,
        notes_ar: input.notes_ar,
      },
      severity: 'medium',
    });

    await notify({
      recipientRole: 'owner',
      severity: 'low',
      eventType: 'stock_adjustment',
      titleAr: 'تعديل مخزون',
      bodyAr: `تم تعديل بيانات توب #${roll.id}`,
      payload: {
        roll_id: roll.id,
        from: { warehouse: roll.warehouse, status: roll.status, weight_kg: roll.weight_kg },
        to: {
          warehouse: patch.warehouse ?? roll.warehouse,
          status: patch.status ?? roll.status,
          weight_kg: patch.weight_kg ?? roll.weight_kg,
        },
        notes_ar: input.notes_ar,
      },
    });

    return movement as StockMovement;
  });
}

async function createAccessoryAdjustment(
  actorUserId: number,
  input: AccessoryAdjustment,
): Promise<StockMovement> {
  return db.transaction(async (trx) => {
    const acc = await trx('accessories').where({ id: input.accessory_id }).forUpdate().first();
    if (!acc) throw new Error('ACCESSORY_NOT_FOUND');

    await trx('accessories').where({ id: acc.id }).update({
      qty_in_stock: input.new_qty,
      updated_at: trx.fn.now(),
    });

    // Ledger row so accessory adjustments appear in the adjustment history
    // alongside rolls. The quantitative before/after lives in the audit entry,
    // mirroring rolls whose weight lives in the audit rather than in the ledger.
    const [{ id: movId }] = await trx('stock_movements').insert({
      roll_id: null,
      entity_type: 'accessory',
      accessory_id: acc.id,
      from_warehouse: null,
      to_warehouse: null,
      event_type: 'adjustment',
      reference_type: 'adjustment',
      reference_id: null,
      actor_user_id: actorUserId,
      notes_ar: input.notes_ar,
    }).returning('id');
    const movement = await trx('stock_movements').where({ id: movId }).first();

    await auditFromService(trx, {
      actorUserId,
      action: 'stock_adjustment',
      entity: 'accessory',
      entityId: acc.id,
      before: { qty_in_stock: acc.qty_in_stock },
      after: { qty_in_stock: input.new_qty, notes_ar: input.notes_ar },
      severity: 'medium',
    });

    await notify({
      recipientRole: 'owner',
      severity: 'low',
      eventType: 'stock_adjustment',
      titleAr: 'تعديل مخزون',
      bodyAr: `تم تعديل كمية الإكسسوار #${acc.id} إلى ${input.new_qty}`,
      payload: {
        accessory_id: acc.id,
        from: { qty_in_stock: acc.qty_in_stock },
        to: { qty_in_stock: input.new_qty },
        notes_ar: input.notes_ar,
      },
    });

    return movement as StockMovement;
  });
}

export async function listAdjustments(): Promise<StockMovement[]> {
  return db('stock_movements')
    .where({ event_type: 'adjustment' })
    .orderBy('id', 'desc')
    .limit(200);
}
