import { db } from '../../db/connection.js';
import type { Knex } from 'knex';
import type { Fabric, RollWithDetails } from './items.types.js';
import type { CreateTopBatchInput } from './tops.schemas.js';
import { auditFromService } from '../inventory/audit.helper.js';

async function generateBarcode(trx: Knex.Transaction): Promise<string> {
  await trx.raw('UPDATE db_sequences SET `last_value` = LAST_INSERT_ID(`last_value` + 1) WHERE name = ?', ['roll_barcode_seq']);
  const [[row]] = await trx.raw<[[{ n: number }]]>('SELECT LAST_INSERT_ID() AS n');
  return `RMX-R-${String(row.n).padStart(6, '0')}`;
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
  const existingByCode = await trx('fabrics').where({ code: ref.code }).first();
  if (existingByCode) throw new Error('FABRIC_CODE_EXISTS');
  const [id] = await trx('fabrics').insert({ ...ref, composition: JSON.stringify(ref.composition) });
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
  const existing = await trx('colors')
    .where({ name_ar: ref.name_ar, code: ref.code })
    .first();
  if (existing) return { id: existing.id as number };
  const [id] = await trx('colors').insert(ref);
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

async function ensureDefaultPrice(
  trx: Knex.Transaction,
  fabricId: number,
  colorId: number,
  pricePerKg: number,
  actorUserId: number,
): Promise<void> {
  const before = await trx('fabric_color_prices')
    .where({ fabric_id: fabricId, color_id: colorId })
    .first();
  await trx('fabric_color_prices')
    .insert({
      fabric_id: fabricId,
      color_id: colorId,
      default_price_per_kg: pricePerKg,
      updated_at: trx.fn.now(),
    })
    .onConflict(['fabric_id', 'color_id'])
    .merge(['default_price_per_kg', 'updated_at']);
  const row = await trx('fabric_color_prices')
    .where({ fabric_id: fabricId, color_id: colorId })
    .first();
  await auditFromService(trx, {
    actorUserId,
    action: before ? 'update_price' : 'create_price',
    entity: 'fabric_color_price',
    entityId: row.id,
    before: before ?? null,
    after: row,
    severity: 'medium',
  });
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

      if (entry.set_default_price_per_kg !== undefined) {
        await ensureDefaultPrice(
          trx,
          fabric.id,
          color.id,
          entry.set_default_price_per_kg,
          actorUserId,
        );
      }

      let sellingPrice = entry.selling_price_egp;
      if (sellingPrice === undefined) {
        const priceRow = await trx('fabric_color_prices')
          .where({ fabric_id: fabric.id, color_id: color.id })
          .first();
        if (!priceRow) throw new Error('NO_DEFAULT_PRICE');
        sellingPrice = Number(priceRow.default_price_per_kg);
      }

      const internal_barcode = await generateBarcode(trx);
      const [rollId] = await trx('rolls').insert({
        fabric_id: fabric.id,
        color_id: color.id,
        weight_kg: entry.weight_kg,
        warehouse: input.warehouse,
        status: 'in_stock',
        selling_price_egp: sellingPrice,
        purchase_price_egp: entry.purchase_price_egp ?? null,
        roll_sr_no: entry.roll_sr_no ?? null,
        order_no: entry.order_no ?? null,
        internal_barcode,
        received_at: trx.fn.now(),
      });
      const roll = await trx('rolls').where({ id: rollId }).first();

      await trx('stock_movements').insert({
        roll_id: roll.id,
        from_warehouse: null,
        to_warehouse: input.warehouse,
        event_type: 'factory_in',
        reference_type: 'direct_seed',
        reference_id: null,
        actor_user_id: actorUserId,
        notes_ar: 'إضافة توب مباشرة',
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
