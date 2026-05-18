import { db } from '../../db/connection.js';
import type { Roll, RollWithDetails, RollWithLabelDetails } from './items.types.js';
import type { UpdateRollInput } from './items.schemas.js';

const ROLL_DETAIL_COLS = [
  'r.*',
  'f.code as fabric_code',
  'f.name_ar as fabric_name_ar',
  'c.name_ar as color_name_ar',
  'c.code as color_code',
] as const;

function rollDetailQuery() {
  return db('rolls as r')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .join('colors as c', 'r.color_id', 'c.id')
    .select(...ROLL_DETAIL_COLS);
}

function rollLabelQuery() {
  return db('rolls as r')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .join('colors as c', 'r.color_id', 'c.id')
    .leftJoin('fabric_grades as g', 'r.grade_id', 'g.id')
    .leftJoin('compositions as comp', 'r.composition_id', 'comp.id')
    .leftJoin('brands as br', 'r.brand_id', 'br.id')
    .leftJoin('suppliers as sup', 'br.supplier_id', 'sup.id')
    .select(
      'r.*',
      'f.code as fabric_code',
      'f.name_ar as fabric_name_ar',
      'c.name_ar as color_name_ar',
      'c.code as color_code',
      'g.arabic_name as grade_arabic_name',
      'comp.description as composition_description',
      'br.arabic_name as brand_arabic_name',
      'br.product_line as brand_product_line',
      'sup.arabic_name as supplier_arabic_name',
      'sup.arabic_warning_text as supplier_arabic_warning_text',
    );
}

export async function listRolls(filters: {
  fabric_id?: number;
  color_id?: number;
  status?: string;
  warehouse?: string;
  is_visible_at_pos?: boolean;
}): Promise<RollWithDetails[]> {
  const q = rollDetailQuery().orderBy('r.id', 'desc');
  if (filters.fabric_id !== undefined) q.where('r.fabric_id', filters.fabric_id);
  if (filters.color_id !== undefined) q.where('r.color_id', filters.color_id);
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
  return rollLabelQuery().where('r.id', id).first();
}

export async function getRollsWithLabel(ids: number[]): Promise<RollWithLabelDetails[]> {
  return rollLabelQuery().whereIn('r.id', ids);
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
  return rollLabelQuery()
    .where((b) =>
      b.where('r.internal_barcode', barcode).orWhere('r.external_barcode', barcode),
    )
    .first();
}

export async function searchRolls(filters: {
  fabric?: string;
  color?: string;
  rollSrNo?: string;
  barcodePartial?: string;
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
  return q;
}
