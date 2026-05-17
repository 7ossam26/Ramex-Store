import { db } from '../../db/connection.js';
import type { Knex } from 'knex';
import type { Color } from './items.types.js';
import type { CreateColorInput, UpdateColorInput } from './items.schemas.js';

async function generateColorCode(trx?: Knex.Transaction): Promise<string> {
  const runner = trx ?? db;
  const result = await (runner as Knex).raw<{ rows: Array<{ n: number | string }> }>(
    'UPDATE db_sequences SET last_value = last_value + 1 WHERE name = ? RETURNING last_value AS n',
    ['color_code_seq'],
  );
  return `L-${String(Number(result.rows[0].n)).padStart(6, '0')}`;
}

export { generateColorCode };

export async function listColors(): Promise<Color[]> {
  return db('colors').orderBy('name_ar');
}

export async function getColor(id: number): Promise<Color | undefined> {
  return db('colors').where({ id }).first();
}

export async function createColor(data: CreateColorInput): Promise<Color> {
  const code = await generateColorCode();
  const [{ id }] = await db('colors').insert({ ...data, code }).returning('id');
  return db('colors').where({ id }).first() as Promise<Color>;
}

export async function updateColor(id: number, data: UpdateColorInput): Promise<Color | undefined> {
  await db('colors').where({ id }).update({ ...data, updated_at: db.fn.now() });
  return db('colors').where({ id }).first();
}
