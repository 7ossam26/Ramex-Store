import { db } from '../../db/connection.js';
import type { Fabric } from './items.types.js';
import type { CreateFabricInput, UpdateFabricInput } from './items.schemas.js';

export async function listFabrics(): Promise<Fabric[]> {
  return db('fabrics').orderBy('code');
}

export async function getFabric(id: number): Promise<Fabric | undefined> {
  return db('fabrics').where({ id }).first();
}

export async function createFabric(data: CreateFabricInput): Promise<Fabric> {
  const [row] = await db('fabrics')
    .insert({ ...data, composition: JSON.stringify(data.composition) })
    .returning('*');
  return row;
}

export async function updateFabric(id: number, data: UpdateFabricInput): Promise<Fabric | undefined> {
  const patch: Record<string, unknown> = { ...data, updated_at: db.fn.now() };
  if (data.composition !== undefined) {
    patch.composition = JSON.stringify(data.composition);
  }
  const [row] = await db('fabrics').where({ id }).update(patch).returning('*');
  return row;
}
