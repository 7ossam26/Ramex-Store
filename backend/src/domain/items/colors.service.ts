import { db } from '../../db/connection.js';
import type { Color } from './items.types.js';
import type { CreateColorInput, UpdateColorInput } from './items.schemas.js';

export async function listColors(): Promise<Color[]> {
  return db('colors').orderBy('name_ar');
}

export async function getColor(id: number): Promise<Color | undefined> {
  return db('colors').where({ id }).first();
}

export async function createColor(data: CreateColorInput): Promise<Color> {
  const [id] = await db('colors').insert(data);
  return db('colors').where({ id }).first() as Promise<Color>;
}

export async function updateColor(id: number, data: UpdateColorInput): Promise<Color | undefined> {
  await db('colors').where({ id }).update({ ...data, updated_at: db.fn.now() });
  return db('colors').where({ id }).first();
}
