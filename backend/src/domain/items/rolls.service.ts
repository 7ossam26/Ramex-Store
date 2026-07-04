import { db } from '../../db/connection.js';
import { auditFromService } from '../inventory/audit.helper.js';
import type { DamageContext, Roll, RollWithDetails, RollWithLabelDetails } from './items.types.js';
import type { UpdateRollInput } from './items.schemas.js';

export class RollValidationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

const ROLL_DETAIL_COLS = [
  'r.*',
  'f.code as fabric_code',
  'f.name_ar as fabric_name_ar',
  'f.unit as fabric_unit',
  'c.name_ar as color_name_ar',
  'c.code as color_code',
  'l.lot_no as lot_no',
] as const;

function rollDetailQuery() {
  return db('rolls as r')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .join('colors as c', 'r.color_id', 'c.id')
    .leftJoin('lots as l', 'r.lot_id', 'l.id')
    .select(...ROLL_DETAIL_COLS);
}

function rollLabelQuery() {
  return db('rolls as r')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .join('colors as c', 'r.color_id', 'c.id')
    .leftJoin('lots as l', 'r.lot_id', 'l.id')
    .leftJoin('fabric_grades as g', function () {
      this.on('g.id', '=', db.raw('COALESCE(r.grade_id, f.default_grade_id)'));
    })
    .leftJoin('compositions as comp', function () {
      this.on('comp.id', '=', db.raw('COALESCE(r.composition_id, f.default_composition_id)'));
    })
    .leftJoin('brands as br', function () {
      this.on('br.id', '=', db.raw('COALESCE(r.brand_id, f.default_brand_id)'));
    })
    .leftJoin('suppliers as sup', 'br.supplier_id', 'sup.id')
    .select(
      'r.*',
      'f.code as fabric_code',
      'f.name_ar as fabric_name_ar',
      'f.unit as fabric_unit',
      'f.gsm as fabric_gsm',
      'f.mad_m as fabric_mad_m',
      'f.composition as fabric_composition',
      'c.name_ar as color_name_ar',
      'c.code as color_code',
      'l.lot_no as lot_no',
      'g.arabic_name as grade_arabic_name',
      'comp.arabic_name as composition_description',
      'br.arabic_name as brand_arabic_name',
      'br.product_line as brand_product_line',
      'sup.arabic_name as supplier_arabic_name',
      'sup.arabic_warning_text as supplier_arabic_warning_text',
    );
}

function safeParseJsonArray(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function formatFabricComposition(raw: unknown): string | null {
  const items = safeParseJsonArray(raw);
  if (!items || items.length === 0) return null;
  const parts = items
    .filter((i): i is { material: string; percent: number } =>
      !!i && typeof i === 'object' &&
      typeof (i as { material: unknown }).material === 'string' &&
      typeof (i as { percent: unknown }).percent === 'number'
    )
    .map((i) => `${i.percent}% ${i.material.trim()}`)
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts.join(' / ') : null;
}

function normalizeLabelRow(row: Record<string, unknown>): RollWithLabelDetails {
  const { fabric_gsm, fabric_mad_m, composition_description, fabric_composition, ...rest } = row;
  let compDesc = composition_description as string | null;
  if (!compDesc && fabric_composition) {
    compDesc = formatFabricComposition(fabric_composition);
  }
  return {
    ...rest,
    gsm: fabric_gsm != null ? Number(fabric_gsm) : null,
    mad_m: fabric_mad_m != null ? Number(fabric_mad_m) : null,
    composition_description: compDesc,
    damage_context: null,
  } as RollWithLabelDetails;
}

export async function listRolls(filters: {
  fabric_id?: number;
  color_id?: number;
  lot_id?: number;
  status?: string;
  warehouse?: string;
  is_visible_at_pos?: boolean;
}): Promise<RollWithDetails[]> {
  const q = rollDetailQuery().orderBy('r.id', 'desc');
  if (filters.fabric_id !== undefined) q.where('r.fabric_id', filters.fabric_id);
  if (filters.color_id !== undefined) q.where('r.color_id', filters.color_id);
  if (filters.lot_id !== undefined) q.where('r.lot_id', filters.lot_id);
  if (filters.status !== undefined) q.where('r.status', filters.status);
  if (filters.warehouse !== undefined) q.where('r.warehouse', filters.warehouse);
  if (filters.is_visible_at_pos !== undefined) {
    q.where('r.is_visible_at_pos', filters.is_visible_at_pos);
  }
  return q;
}

export async function getRoll(id: number): Promise<RollWithDetails | undefined> {
  return rollDetailQuery().where('r.id', id).first();
}

export async function getRollWithLabel(id: number): Promise<RollWithLabelDetails | undefined> {
  const row = await rollLabelQuery().where('r.id', id).first();
  return row ? normalizeLabelRow(row) : undefined;
}

export async function getRollsWithLabel(ids: number[]): Promise<RollWithLabelDetails[]> {
  const rows = await rollLabelQuery().whereIn('r.id', ids);
  return rows.map(normalizeLabelRow);
}

export async function updateRoll(
  id: number,
  data: UpdateRollInput,
): Promise<Roll | undefined> {
  const existing = await db('rolls').where({ id }).first();
  if (!existing) return undefined;

  const patch = { ...data } as Record<string, unknown>;
  if (existing.status === 'sold') {
    delete patch.selling_price_egp;
    delete patch.weight_kg;
  }

  await db('rolls').where({ id }).update({ ...patch, updated_at: db.fn.now() });
  return db('rolls').where({ id }).first() as Promise<Roll>;
}

export async function togglePosVisibility(id: number): Promise<Roll | undefined> {
  const existing = await db('rolls').where({ id }).first();
  if (!existing) return undefined;
  await db('rolls').where({ id }).update({ is_visible_at_pos: !existing.is_visible_at_pos, updated_at: db.fn.now() });
  return db('rolls').where({ id }).first() as Promise<Roll>;
}

export async function findByBarcode(
  barcode: string,
): Promise<RollWithLabelDetails | undefined> {
  const row = await rollLabelQuery()
    .where((b) =>
      b.where('r.internal_barcode', barcode).orWhere('r.external_barcode', barcode),
    )
    .first();
  if (!row) return undefined;
  const roll = normalizeLabelRow(row);

  let damage_context: DamageContext | null = null;

  if (roll.status === 'damaged' || roll.status === 'written_off') {
    // Applied events: auto-applied (requires_approval=false) OR owner-approved (approved_at set)
    const event = await db('damage_events')
      .where({ roll_id: roll.id })
      .where((b) => b.where({ requires_approval: false }).orWhereNotNull('approved_at'))
      .orderBy('id', 'desc')
      .first();
    if (event) {
      damage_context = {
        pending: false,
        reason_code: event.reason_code as string,
        notes_ar: event.notes_ar as string | null,
        event_created_at: event.created_at as Date,
      };
    }
  } else if (roll.status === 'in_stock') {
    // Pending event awaiting owner approval
    const pending = await db('damage_events')
      .where({ roll_id: roll.id, requires_approval: true })
      .whereNull('approved_at')
      .orderBy('id', 'desc')
      .first();
    if (pending) {
      damage_context = {
        pending: true,
        reason_code: pending.reason_code as string,
        notes_ar: pending.notes_ar as string | null,
        event_created_at: pending.created_at as Date,
      };
    }
  }

  return { ...roll, damage_context };
}

export async function returnRollToFactory(
  rollId: number,
  actorUserId: number,
): Promise<Roll> {
  const roll = await db('rolls').where({ id: rollId }).first();
  if (!roll) throw new RollValidationError('not_found', 'Roll not found');
  if (roll.warehouse !== 'shop' || roll.status !== 'in_stock') {
    throw new RollValidationError(
      'invalid_state',
      'Only in-stock shop rolls can be returned to the factory',
    );
  }

  await db.transaction(async (trx) => {
    await trx('rolls').where({ id: rollId }).update({
      warehouse: 'factory',
      updated_at: trx.fn.now(),
    });
    await trx('stock_movements').insert({
      roll_id: rollId,
      from_warehouse: 'shop',
      to_warehouse: 'factory',
      event_type: 'shop_to_factory_return',
      actor_user_id: actorUserId,
      notes_ar: null,
      created_at: trx.fn.now(),
    });
    await auditFromService(trx, {
      actorUserId,
      action: 'shop_to_factory_return',
      entity: 'roll',
      entityId: rollId,
      before: { warehouse: 'shop', roll_sr_no: roll.roll_sr_no, status: roll.status },
      after: { warehouse: 'factory' },
      severity: 'medium',
    });
  });

  return db('rolls').where({ id: rollId }).first() as Promise<Roll>;
}

export async function searchRolls(filters: {
  fabric?: string;
  color?: string;
  rollSrNo?: string;
  barcodePartial?: string;
  warehouse?: string;
}): Promise<RollWithDetails[]> {
  const q = rollDetailQuery().orderBy('r.id', 'desc').limit(100);
  if (filters.fabric) q.whereILike('f.name_ar', `%${filters.fabric}%`);
  if (filters.color) q.whereILike('c.name_ar', `%${filters.color}%`);
  if (filters.rollSrNo) q.whereILike('r.roll_sr_no', `%${filters.rollSrNo}%`);
  if (filters.barcodePartial) {
    q.where((b) =>
      b
        .whereILike('r.internal_barcode', `%${filters.barcodePartial}%`)
        .orWhereILike('r.external_barcode', `%${filters.barcodePartial}%`),
    );
  }
  if (filters.warehouse) q.where('r.warehouse', filters.warehouse);
  return q;
}
