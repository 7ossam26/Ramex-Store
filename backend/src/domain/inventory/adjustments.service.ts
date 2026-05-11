import { db } from '../../db/connection.js';
import { auditFromService } from './audit.helper.js';
import { notify } from '../notifications/notificationsService.js';
import type { CreateAdjustmentInput } from './inventory.schemas.js';
import type { StockMovement } from './inventory.types.js';

export async function createAdjustment(
  actorUserId: number,
  input: CreateAdjustmentInput,
): Promise<StockMovement> {
  return db.transaction(async (trx) => {
    const roll = await trx('rolls').where({ id: input.roll_id }).first();
    if (!roll) throw new Error('ROLL_NOT_FOUND');

    const fromWarehouse = roll.warehouse;
    const patch: Record<string, unknown> = { updated_at: trx.fn.now() };
    if (input.new_warehouse !== undefined) patch.warehouse = input.new_warehouse;
    if (input.new_status !== undefined) patch.status = input.new_status;
    if (input.new_weight_kg !== undefined) patch.weight_kg = input.new_weight_kg;

    await trx('rolls').where({ id: roll.id }).update(patch);

    const toWarehouse = input.new_warehouse ?? fromWarehouse;
    const [{ id: movId }] = await trx('stock_movements').insert({
      roll_id: roll.id,
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

export async function listAdjustments(): Promise<StockMovement[]> {
  return db('stock_movements')
    .where({ event_type: 'adjustment' })
    .orderBy('id', 'desc')
    .limit(200);
}
