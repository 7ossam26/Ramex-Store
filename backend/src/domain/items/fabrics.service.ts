import { db } from '../../db/connection.js';
import type { Knex } from 'knex';
import type { Fabric } from './items.types.js';
import type { CreateFabricInput, UpdateFabricInput } from './items.schemas.js';

async function generateFabricCode(trx?: Knex.Transaction): Promise<string> {
  const runner = trx ?? db;
  const result = await (runner as Knex).raw<{ rows: Array<{ n: number | string }> }>(
    'UPDATE db_sequences SET last_value = last_value + 1 WHERE name = ? RETURNING last_value AS n',
    ['fabric_code_seq'],
  );
  return `M-${String(Number(result.rows[0].n)).padStart(6, '0')}`;
}

export { generateFabricCode };

export async function listFabrics(): Promise<Fabric[]> {
  return db('fabrics').orderBy('code');
}

export async function getFabric(id: number): Promise<Fabric | undefined> {
  return db('fabrics').where({ id }).first();
}

export async function createFabric(data: CreateFabricInput): Promise<Fabric> {
  const code = await generateFabricCode();
  const [{ id }] = await db('fabrics')
    .insert({ ...data, code })
    .returning('id');
  return db('fabrics').where({ id }).first() as Promise<Fabric>;
}

export async function updateFabric(id: number, data: UpdateFabricInput): Promise<Fabric | undefined> {
  const patch: Record<string, unknown> = { ...data, updated_at: db.fn.now() };
  await db('fabrics').where({ id }).update(patch);
  return db('fabrics').where({ id }).first();
}

export async function deleteFabric(id: number): Promise<void> {
  const fabric = await db('fabrics').where({ id }).first();
  if (!fabric) throw new Error('FABRIC_NOT_FOUND');

  const [rolls, lots, prices, stocktakeLines] = await Promise.all([
    db('rolls').where({ fabric_id: id }).first(),
    db('lots').where({ fabric_id: id }).first(),
    db('fabric_color_prices').where({ fabric_id: id }).first(),
    db('stocktake_lines').where({ fabric_id: id }).first(),
  ]);
  if (rolls || lots || prices || stocktakeLines) throw new Error('FABRIC_IN_USE');

  await db('fabrics').where({ id }).delete();
}
