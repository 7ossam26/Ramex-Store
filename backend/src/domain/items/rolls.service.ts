import { db } from '../../db/connection.js';
import type { Roll, RollWithDetails } from './items.types.js';
import type { CreateRollInput, UpdateRollInput } from './items.schemas.js';

async function generateBarcode(): Promise<string> {
  const result = await db.raw<{ rows: Array<{ n: string }> }>(
    `SELECT nextval('roll_barcode_seq') AS n`,
  );
  const n = Number(result.rows[0].n);
  return `RMX-R-${String(n).padStart(6, '0')}`;
}

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

export async function createRoll(data: CreateRollInput): Promise<Roll> {
  let sellingPrice = data.selling_price_egp;

  if (sellingPrice === undefined) {
    const priceRow = await db('fabric_color_prices')
      .where({ fabric_id: data.fabric_id, color_id: data.color_id })
      .first();
    if (!priceRow) throw new Error('NO_DEFAULT_PRICE');
    sellingPrice = Number(priceRow.default_price_per_kg);
  }

  const internal_barcode = await generateBarcode();
  const [row] = await db('rolls')
    .insert({ ...data, selling_price_egp: sellingPrice, internal_barcode })
    .returning('*');
  return row;
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

  const [row] = await db('rolls')
    .where({ id })
    .update({ ...patch, updated_at: db.fn.now() })
    .returning('*');
  return row;
}

export async function togglePosVisibility(id: number): Promise<Roll | undefined> {
  const existing = await db('rolls').where({ id }).first();
  if (!existing) return undefined;
  const [row] = await db('rolls')
    .where({ id })
    .update({ is_visible_at_pos: !existing.is_visible_at_pos, updated_at: db.fn.now() })
    .returning('*');
  return row;
}

export async function findByBarcode(barcode: string): Promise<RollWithDetails | undefined> {
  return rollDetailQuery()
    .where('r.internal_barcode', barcode)
    .orWhere('r.external_barcode', barcode)
    .first();
}
