import { db } from '../../db/connection.js';
import type { FabricColorPrice } from './items.types.js';
import type { UpsertPriceInput } from './items.schemas.js';

export async function listPrices(): Promise<FabricColorPrice[]> {
  return db('fabric_color_prices').orderBy('fabric_id').orderBy('color_id');
}

export async function getPrice(
  fabricId: number,
  colorId: number,
): Promise<FabricColorPrice | undefined> {
  return db('fabric_color_prices')
    .where({ fabric_id: fabricId, color_id: colorId })
    .first();
}

export async function upsertPrice(data: UpsertPriceInput): Promise<FabricColorPrice> {
  const [row] = await db('fabric_color_prices')
    .insert({ ...data, updated_at: db.fn.now() })
    .onConflict(['fabric_id', 'color_id'])
    .merge(['default_price_per_kg', 'default_price_per_roll', 'updated_at'])
    .returning('*');
  return row;
}
