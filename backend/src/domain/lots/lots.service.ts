import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import type { Lot, LotWithDetails } from './lots.types.js';
import type { CreateLotInput, UpdateLotInput, ListLotsQueryInput } from './lots.schemas.js';

// LT-NNNNNN. Distinct from color codes which use the L- prefix.
async function generateLotNo(trx: Knex.Transaction): Promise<string> {
  const result = await trx.raw<{ rows: Array<{ n: number | string }> }>(
    'UPDATE db_sequences SET last_value = last_value + 1 WHERE name = ? RETURNING last_value AS n',
    ['lot_no_seq'],
  );
  return `LT-${String(Number(result.rows[0].n)).padStart(6, '0')}`;
}

const LOT_DETAIL_COLS = [
  'lots.*',
  'f.code as fabric_code',
  'f.name_ar as fabric_name_ar',
  'c.name_ar as color_name_ar',
  'c.code as color_code',
] as const;

function lotDetailQuery() {
  return db('lots')
    .join('fabrics as f', 'f.id', 'lots.fabric_id')
    .join('colors as c', 'c.id', 'lots.color_id')
    .select(...LOT_DETAIL_COLS);
}

export async function listLots(filters: ListLotsQueryInput): Promise<LotWithDetails[]> {
  const q = lotDetailQuery().orderBy('lots.id', 'desc');
  if (filters.fabric_id !== undefined) q.where('lots.fabric_id', filters.fabric_id);
  if (filters.color_id !== undefined) q.where('lots.color_id', filters.color_id);
  return q;
}

export async function getLot(id: number): Promise<LotWithDetails | undefined> {
  return lotDetailQuery().where('lots.id', id).first();
}

export async function createLot(input: CreateLotInput): Promise<LotWithDetails> {
  return db.transaction(async (trx) => {
    const fabric = await trx('fabrics').where({ id: input.fabric_id }).first();
    if (!fabric) throw new Error('FABRIC_NOT_FOUND');
    const color = await trx('colors').where({ id: input.color_id }).first();
    if (!color) throw new Error('COLOR_NOT_FOUND');

    const lot_no = await generateLotNo(trx);
    const [{ id }] = await trx('lots')
      .insert({
        lot_no,
        fabric_id: input.fabric_id,
        color_id: input.color_id,
        notes_ar: input.notes_ar ?? null,
      })
      .returning('id');

    const created = await trx('lots')
      .join('fabrics as f', 'f.id', 'lots.fabric_id')
      .join('colors as c', 'c.id', 'lots.color_id')
      .select(...LOT_DETAIL_COLS)
      .where('lots.id', id)
      .first();
    return created as LotWithDetails;
  });
}

export async function updateLot(
  id: number,
  data: UpdateLotInput,
): Promise<LotWithDetails | undefined> {
  const existing = await db('lots').where({ id }).first<Lot | undefined>();
  if (!existing) return undefined;
  await db('lots').where({ id }).update({
    notes_ar: data.notes_ar ?? null,
    updated_at: db.fn.now(),
  });
  return getLot(id);
}
