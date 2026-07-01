import { db } from '../../db/connection.js';
import type { Knex } from 'knex';
import type { Fabric, RollWithDetails } from './items.types.js';
import type { CreateTopBatchInput } from './tops.schemas.js';
import { auditFromService } from '../inventory/audit.helper.js';
import { generateFabricCode } from './fabrics.service.js';
import { generateColorCode } from './colors.service.js';

export class TopSplitError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

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
  const [{ id }] = await trx('fabrics').insert({ ...ref, code }).returning('id');
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
    if (fabric.unit === 'meter') {
      const missing = input.rolls.some((r) => !r.length_m || r.length_m <= 0);
      if (missing) throw new Error('LENGTH_M_REQUIRED_FOR_METER_FABRIC');
    }

    const createdRollIds: number[] = [];

    for (const entry of input.rolls) {
      const color = await resolveColor(trx, entry.color, actorUserId);

      if (entry.lot_id != null) {
        const lot = await trx('lots').where({ id: entry.lot_id }).first();
        if (!lot) throw new Error('LOT_NOT_FOUND');
        if (lot.fabric_id !== fabric.id || lot.color_id !== color.id) {
          throw new Error('LOT_FABRIC_COLOR_MISMATCH');
        }
      }

      const internal_barcode = await generateBarcode(trx);
      const [{ id: rollId }] = await trx('rolls').insert({
        fabric_id: fabric.id,
        color_id: color.id,
        lot_id: entry.lot_id ?? null,
        weight_kg: entry.weight_kg ?? null,
        length_m: entry.length_m ?? null,
        warehouse: 'factory',
        status: 'in_stock',
        selling_price_egp: null,
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
      .leftJoin('lots as l', 'r.lot_id', 'l.id')
      .select(
        'r.*',
        'f.code as fabric_code',
        'f.name_ar as fabric_name_ar',
        'f.unit as fabric_unit',
        'c.name_ar as color_name_ar',
        'c.code as color_code',
        'l.lot_no as lot_no',
      )
      .whereIn('r.id', createdRollIds)
      .orderBy('r.id', 'asc')) as RollWithDetails[];

    return { fabric, rolls };
  });
}

function rollDetailQuery(trx: Knex.Transaction) {
  return trx('rolls as r')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .join('colors as c', 'r.color_id', 'c.id')
    .leftJoin('lots as l', 'r.lot_id', 'l.id')
    .select(
      'r.*',
      'f.code as fabric_code',
      'f.name_ar as fabric_name_ar',
      'f.unit as fabric_unit',
      'c.name_ar as color_name_ar',
      'c.code as color_code',
      'l.lot_no as lot_no',
    );
}

export async function splitTop(
  rollId: number,
  newQuantity: number,
  actorUserId: number,
): Promise<{ original: RollWithDetails; rib: RollWithDetails }> {
  return db.transaction(async (trx) => {
    const parent = await trx('rolls').where({ id: rollId }).forUpdate().first();
    if (!parent) throw new TopSplitError('ROLL_NOT_FOUND', 'التوب غير موجود');

    const fabric = await trx('fabrics').where({ id: parent.fabric_id }).first() as Fabric;
    if (!fabric) throw new TopSplitError('ROLL_NOT_FOUND', 'بيانات الخامة غير موجودة');

    if (parent.status !== 'in_stock') {
      throw new TopSplitError('ROLL_NOT_SPLITTABLE', 'لا يمكن تقسيم توب غير موجود في المخزن');
    }

    const qtyField = fabric.unit === 'meter' ? 'length_m' : 'weight_kg';
    const current = Number(parent[qtyField]);
    if (!current || current <= 0) {
      throw new TopSplitError('ROLL_QUANTITY_MISSING', 'الكمية الحالية للتوب غير محددة أو صفر');
    }

    const rounded = Math.round(newQuantity * 1000) / 1000;
    if (rounded <= 0 || rounded >= current) {
      throw new TopSplitError('INVALID_SPLIT_QUANTITY', 'الكمية الجديدة يجب أن تكون أكبر من صفر وأصغر من الكمية الأصلية');
    }

    const remainder = Math.round((current - rounded) * 1000) / 1000;

    await trx('rolls').where({ id: rollId }).update({
      [qtyField]: remainder,
      updated_at: new Date(),
    });

    const internal_barcode = await generateBarcode(trx);

    const [{ id: ribId }] = await trx('rolls').insert({
      fabric_id: parent.fabric_id,
      color_id: parent.color_id,
      lot_id: parent.lot_id ?? null,
      weight_kg: qtyField === 'weight_kg' ? rounded : null,
      length_m: qtyField === 'length_m' ? rounded : null,
      warehouse: parent.warehouse,
      status: 'in_stock',
      selling_price_egp: parent.selling_price_egp ?? null,
      reference_price_per_unit: parent.reference_price_per_unit ?? null,
      roll_sr_no: null,
      order_no: parent.order_no ?? null,
      supplier_order_no: parent.supplier_order_no ?? null,
      top_number: null,
      width_cm: parent.width_cm ?? null,
      grade_id: parent.grade_id ?? null,
      composition_id: parent.composition_id ?? null,
      brand_id: parent.brand_id ?? null,
      external_barcode: null,
      is_visible_at_pos: parent.is_visible_at_pos,
      received_at: null,
      internal_barcode,
    }).returning('id');

    await trx('stock_movements').insert({
      roll_id: rollId,
      from_warehouse: parent.warehouse,
      to_warehouse: parent.warehouse,
      event_type: 'adjustment',
      reference_type: 'roll_split',
      reference_id: rollId,
      actor_user_id: actorUserId,
      notes_ar: 'تقسيم توب / تحديث الكمية المتبقية',
    });

    await trx('stock_movements').insert({
      roll_id: ribId,
      from_warehouse: null,
      to_warehouse: parent.warehouse,
      event_type: 'adjustment',
      reference_type: 'roll_split',
      reference_id: rollId,
      actor_user_id: actorUserId,
      notes_ar: 'تقسيم توب / إضافة ريب',
    });

    const updatedParent = await trx('rolls').where({ id: rollId }).first();
    await auditFromService(trx, {
      actorUserId,
      action: 'split_roll',
      entity: 'roll',
      entityId: rollId,
      before: { [qtyField]: current },
      after: { [qtyField]: remainder, rib_roll_id: ribId },
      severity: 'medium',
    });

    const rib = await trx('rolls').where({ id: ribId }).first();
    await auditFromService(trx, {
      actorUserId,
      action: 'create_roll',
      entity: 'roll',
      entityId: ribId,
      after: rib,
      severity: 'medium',
    });

    const [originalDetail] = await rollDetailQuery(trx).where('r.id', rollId) as RollWithDetails[];
    const [ribDetail] = await rollDetailQuery(trx).where('r.id', ribId) as RollWithDetails[];

    return { original: originalDetail, rib: ribDetail };
  });
}
