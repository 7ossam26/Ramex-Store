import type { Knex } from 'knex';
import { db } from '../../db/connection.js';

type Conn = Knex | Knex.Transaction;

/**
 * Reads a setting value. Returns `defaultValue` if the key is absent.
 * Settings are stored as JSONB so the parsed shape is whatever was inserted.
 *
 * Phase 11 will add a Settings UI editor; for Phase 2 we only read.
 */
export async function getSetting<T>(
  conn: Conn | undefined,
  key: string,
  defaultValue: T,
): Promise<T> {
  const c: Conn = conn ?? db;
  const row = await c('settings').where({ key }).first();
  if (!row) return defaultValue;
  return row.value_json as T;
}

export async function listSettings(): Promise<Array<{ key: string; value_json: unknown }>> {
  return db('settings').select('key', 'value_json').orderBy('key');
}
