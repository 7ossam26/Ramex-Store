import { db } from '../../db/connection.js';
import type { Knex } from 'knex';
import type { Fabric, RollWithDetails } from './items.types.js';
import type { CreateTopBatchInput } from './tops.schemas.js';
import { auditFromService } from '../inventory/audit.helper.js';
import { generateFabricCode } from './fabrics.service.js';
import { generateColorCode } from './colors.service.js';

async function generateBarcode(trx: Knex.Transaction): Promise<string> {
  const result = await trx.raw<{ rows: Array<{ n: number | string }> }>(
    'UPDATE db_sequences SET last_value = last_value + 1 WHERE name = ? RETURNING last_value AS n',
    ['roll_barcode_seq'],
  );
  return `RMX-R-${String(Number(result.rows[0].n)).padStart(6, '0')}`;
}

async function resolveFabric(
  trx: Knex.Transaction,
  ref: CreateTopBatchInput['fabric'],
  actorUserId: number,
): Promise<Fabric> {
  if ('id' in ref) {
    const f = await trx('fabrics').where({ id: ref.id }).first();
    if (!f) throw new Error('FABRIC_NOT_FOUND');
    return f as Fabric;
  }
  const code = await generateFabricCode(trx);
  const [{ id }] = await trx('fabrics').insert({ ...ref, code, composition: JSON.stringify(ref.composition) }).returning('id');
  const created = await trx('fabrics').where({ id }).first();
  await auditFromService(trx, {
    actorUserId,
    action: 'create_fabric',
    entity: 'fabric',
    entityId: created.id,
    after: created,
    severity: 'medium',
  });
  return created as Fabric;
}

async function resolveColor(
  trx: Knex.Transaction,
  ref: CreateTopBatchInput['rolls'][number]['color'],
  actorUserId: number,
): Promise<{ id: number }> {
  if ('id' in ref) {
    const c = await trx('colors').where({ id: ref.id }).first();
    if (!c) throw new Error('COLOR_NOT_FOUND');
    return { id: c.id as number };
  }
  const existing = await trx('colors').where({ name_ar: ref.name_ar }).first();
  if (existing) return { id: existing.id as number };
  const code = await generateColorCode(trx);
  const [{ id }] = await trx('colors').insert({ ...ref, code }).returning('id');
  const created = await trx('colors').where({ id }).first();
  await auditFromService(trx, {
    actorUserId,
    action: 'create_color',
    entity: 'color',
    entityId: created.id,
    after: created,
    severity: 'medium',
  });
  return { id: created.id as number };
}

export async function createTopBatch(
  input: CreateTopBatchInput,
  actorUserId: number,
): Promise<{ fabric: Fabric; rolls: RollWithDetails[] }> {
  return db.transaction(async (trx) => {
    const fabric = await resolveFabric(trx, input.fabric, actorUserId);
    const createdRollIds: number[] = [];

    for (const entry of input.rolls) {
      const color = await resolveColor(trx, entry.color, actorUserId);

      const internal_barcode = await generateBarcode(trx);
      const [{ id: rollId }] = await trx('rolls').insert({
        fabric_id: fabric.id,
        color_id: color.id,
        weight_kg: entry.weight_kg,
        warehouse: 'factory',
        status: 'in_stock',
        selling_price_egp: null,
        purchase_price_egp: entry.purchase_price_egp ?? null,
        roll_sr_no: entry.roll_sr_no ?? null,
        order_no: entry.order_no ?? null,
        supplier_order_no: entry.supplier_order_no ?? null,
        top_number: entry.top_number ?? null,
        width_cm: entry.width_cm ?? null,
        grade_id: entry.grade_id ?? null,
        composition_id: entry.composition_id ?? null,
        brand_id: entry.brand_id ?? null,
        internal_barcode,
        received_at: null,
      }).returning('id');
      const roll = await trx('rolls').where({ id: rollId }).first();

      await trx('stock_movements').insert({
        roll_id: roll.id,
        from_warehouse: null,
        to_warehouse: 'factory',
        event_type: 'factory_in',
        reference_type: 'add_top_wizard',
        reference_id: null,
        actor_user_id: actorUserId,
        notes_ar: 'إضافة توب إلى مخزن المصنع',
      });

      await auditFromService(trx, {
        actorUserId,
        action: 'create_roll',
        entity: 'roll',
        entityId: roll.id,
        after: roll,
        severity: 'medium',
      });

      createdRollIds.push(roll.id as number);
    }

    const rolls = (await trx('rolls as r')
      .join('fabrics as f', 'r.fabric_id', 'f.id')
      .join('colors as c', 'r.color_id', 'c.id')
      .select(
        'r.*',
        'f.code as fabric_code',
        'f.name_ar as fabric_name_ar',
        'c.name_ar as color_name_ar',
        'c.code as color_code',
      )
      .whereIn('r.id', createdRollIds)
      .orderBy('r.id', 'asc')) as RollWithDetails[];

    return { fabric, rolls };
  });
}
