import type { Knex } from 'knex';
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
    // Locked for the same reason the accessory branch below locks: two
    // تسويات on one توب would otherwise read the same starting quantity and
    // the second would silently overwrite the first.
    const roll = await trx('rolls').where({ id: input.roll_id }).forUpdate().first();
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

    const { movement, after } = await applyRollPatch(
      trx,
      actorUserId,
      roll,
      {
        warehouse: input.new_warehouse,
        status: input.new_status,
        weight_kg: input.new_weight_kg,
        length_m: input.new_length_m,
      },
      {
        eventType: 'adjustment',
        referenceType: 'adjustment',
        referenceId: null,
        notesAr: input.notes_ar,
        auditAction: 'stock_adjustment',
        severity: 'medium',
      },
    );

    await notify({
      recipientRole: 'owner',
      severity: 'low',
      eventType: 'stock_adjustment',
      titleAr: 'تعديل مخزون',
      bodyAr: `تم تعديل بيانات توب #${roll.id}`,
      payload: {
        roll_id: roll.id,
        from: {
          warehouse: roll.warehouse,
          status: roll.status,
          weight_kg: roll.weight_kg,
          length_m: roll.length_m,
        },
        to: after,
        notes_ar: input.notes_ar,
      },
    });

    return movement;
  });
}

type LockedRoll = {
  id: number;
  warehouse: string;
  status: string;
  weight_kg: string | number | null;
  length_m: string | number | null;
};

export type RollChange = {
  warehouse?: string;
  status?: string;
  weight_kg?: number;
  length_m?: number;
};

export type RollChangeOptions = {
  eventType: 'adjustment' | 'loss_writeoff';
  referenceType: string;
  referenceId: number | null;
  notesAr: string | null;
  auditAction: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Extra fields merged into the audit `after` payload. */
  auditExtra?: Record<string, unknown>;
};

/**
 * Apply a change to an already-locked توب and record it: the roll update, one
 * stock_movements ledger row and one audit entry. Shared by تسويات and by
 * stocktake resolutions so both follow the same POS-visibility rule. Callers
 * own their business guards (factory exit, re-activation) and notifications.
 */
export async function applyRollPatch(
  trx: Knex.Transaction,
  actorUserId: number,
  roll: LockedRoll,
  change: RollChange,
  opts: RollChangeOptions,
): Promise<{ movement: StockMovement; after: Omit<LockedRoll, 'id'> }> {
  const patch: Record<string, unknown> = { updated_at: trx.fn.now() };
  if (change.warehouse !== undefined) patch.warehouse = change.warehouse;
  if (change.status !== undefined) patch.status = change.status;
  if (change.weight_kg !== undefined) patch.weight_kg = change.weight_kg;
  if (change.length_m !== undefined) patch.length_m = change.length_m;

  // Keep POS visibility coherent with the status, but only on an actual
  // transition in or out of «متاح».
  //
  // «تحويل إلى عيّنة» sets status AND is_visible_at_pos=false together, while
  // a تسوية used to set status alone — so bringing a توب back to «متاح» left
  // is_visible_at_pos stuck at false and it stayed invisible in شاشة البيع
  // despite reading متاح. Coming back into a sellable state, that false is
  // residue rather than intent: POS already excludes any non-متاح توب, so the
  // flag carried no meaning while the توب was out.
  //
  // Guarding on a transition matters: a تسوية that only corrects the weight
  // must not clobber a POS hide the user set deliberately with the toggle.
  if (change.status !== undefined && change.status !== roll.status) {
    patch.is_visible_at_pos = change.status === 'in_stock';
  }

  await trx('rolls').where({ id: roll.id }).update(patch);

  const after = {
    warehouse: change.warehouse ?? roll.warehouse,
    status: change.status ?? roll.status,
    weight_kg: change.weight_kg ?? roll.weight_kg,
    length_m: change.length_m ?? roll.length_m,
  };

  const [{ id: movId }] = await trx('stock_movements').insert({
    roll_id: roll.id,
    entity_type: 'roll',
    accessory_id: null,
    from_warehouse: roll.warehouse,
    to_warehouse: after.warehouse,
    event_type: opts.eventType,
    reference_type: opts.referenceType,
    reference_id: opts.referenceId,
    actor_user_id: actorUserId,
    notes_ar: opts.notesAr,
  }).returning('id');
  const movement = await trx('stock_movements').where({ id: movId }).first();

  await auditFromService(trx, {
    actorUserId,
    action: opts.auditAction,
    entity: 'roll',
    entityId: roll.id,
    before: {
      warehouse: roll.warehouse,
      status: roll.status,
      weight_kg: roll.weight_kg,
      length_m: roll.length_m,
    },
    after: { ...after, notes_ar: opts.notesAr, ...opts.auditExtra },
    severity: opts.severity,
  });

  return { movement: movement as StockMovement, after };
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

/** A movement plus the names the الصنف column shows and the search box matches. */
export type AdjustmentRow = StockMovement & {
  internal_barcode: string | null;
  fabric_name_ar: string | null;
  color_name_ar: string | null;
  accessory_name_ar: string | null;
};

export async function listAdjustments(): Promise<AdjustmentRow[]> {
  // Every join must be a LEFT join: adjustments cover اكسسوارات as well as
  // أتواب, and an inner join on rolls would silently drop every accessory row.
  const rows = await db('stock_movements as sm')
    .where('sm.event_type', 'adjustment')
    .leftJoin('rolls as r', 'sm.roll_id', 'r.id')
    .leftJoin('fabrics as f', 'r.fabric_id', 'f.id')
    .leftJoin('colors as c', 'r.color_id', 'c.id')
    .leftJoin('accessories as a', 'sm.accessory_id', 'a.id')
    .select(
      'sm.*',
      'r.internal_barcode',
      'f.name_ar as fabric_name_ar',
      'c.name_ar as color_name_ar',
      'a.name_ar as accessory_name_ar',
    )
    .orderBy('sm.id', 'desc')
    .limit(200);

  return rows as AdjustmentRow[];
}
