import { z } from 'zod';
import { db } from '../../db/connection.js';
import { SETTINGS_SCHEMAS, LEGACY_KEY_MAP, type SettingKey } from './keys.js';

// 60-second in-memory cache
const _cache = new Map<string, { value: unknown; expiresAt: number }>();
const TTL = 60_000;

function _fromCache(key: string): unknown {
  const e = _cache.get(key);
  return e && Date.now() <= e.expiresAt ? e.value : undefined;
}
function _toCache(key: string, value: unknown): void {
  _cache.set(key, { value, expiresAt: Date.now() + TTL });
}
function _bust(key: string): void {
  _cache.delete(key);
  const legacy = LEGACY_KEY_MAP[key as SettingKey];
  if (legacy) _cache.delete(legacy);
}

export type SettingVersionRow = {
  id: number;
  key: string;
  previous_value_jsonb: unknown;
  new_value_jsonb: unknown;
  actor_user_id: number;
  actor_username: string | null;
  created_at: string;
};

type InferSchema<K extends SettingKey> = z.infer<typeof SETTINGS_SCHEMAS[K]>;

/** Read a settings value; falls back to the zod default when absent. */
export async function get<K extends SettingKey>(key: K): Promise<InferSchema<K>> {
  const cached = _fromCache(key);
  if (cached !== undefined) return cached as InferSchema<K>;

  const row = await db('settings').where({ key }).first() as
    { value_json: unknown } | undefined;

  const schema = SETTINGS_SCHEMAS[key] as z.ZodType;
  const value = row ? (row.value_json as InferSchema<K>) : schema.parse(undefined);
  _toCache(key, value);
  return value as InferSchema<K>;
}

/** Write a settings value with history trail + legacy-key write. */
export async function set(
  key: SettingKey,
  value: unknown,
  actorUserId: number,
): Promise<void> {
  if (key === 'audit.retention') throw Object.assign(new Error('SETTING_READONLY'), { status: 400 });

  const schema = SETTINGS_SCHEMAS[key] as z.ZodType;
  const parsed = schema.parse(value);

  await db.transaction(async (trx) => {
    const existing = await trx('settings').where({ key }).first() as
      { value_json: unknown } | undefined;
    const previous = existing ? existing.value_json : null;

    if (existing) {
      await trx('settings').where({ key }).update({
        value_json: JSON.stringify(parsed),
        updated_at: trx.fn.now(),
        updated_by_user_id: actorUserId,
      });
    } else {
      await trx('settings').insert({
        key,
        value_json: JSON.stringify(parsed),
        updated_by_user_id: actorUserId,
      });
    }

    await trx('settings_versions').insert({
      key,
      previous_value_jsonb: previous !== null ? JSON.stringify(previous) : null,
      new_value_jsonb: JSON.stringify(parsed),
      actor_user_id: actorUserId,
    });

    // Also keep legacy key in sync so old code paths continue working
    const legacyKey = LEGACY_KEY_MAP[key];
    if (legacyKey) {
      const legacyExists = await trx('settings').where({ key: legacyKey }).first();
      if (legacyExists) {
        await trx('settings').where({ key: legacyKey }).update({
          value_json: JSON.stringify(parsed),
          updated_at: trx.fn.now(),
          updated_by_user_id: actorUserId,
        });
      } else {
        await trx('settings').insert({
          key: legacyKey,
          value_json: JSON.stringify(parsed),
          updated_by_user_id: actorUserId,
        });
      }
    }
  });

  _bust(key);
}

/** Return all settings as a flat key→value map; missing namespaced keys filled with defaults. */
export async function getAll(): Promise<Record<string, unknown>> {
  const rows = await db('settings').select('key', 'value_json') as
    Array<{ key: string; value_json: unknown }>;

  const result: Record<string, unknown> = {};
  for (const r of rows) result[r.key] = r.value_json;

  // Fill in defaults for any missing canonical keys
  for (const [key, schema] of Object.entries(SETTINGS_SCHEMAS)) {
    if (!(key in result)) result[key] = (schema as z.ZodType).parse(undefined);
  }
  return result;
}

/** Append-only edit history for a given key. */
export async function history(key: string, limit = 50): Promise<SettingVersionRow[]> {
  return db('settings_versions as sv')
    .leftJoin('users as u', 'sv.actor_user_id', 'u.id')
    .select('sv.*', 'u.username as actor_username')
    .where('sv.key', key)
    .orderBy('sv.created_at', 'desc')
    .limit(limit) as unknown as SettingVersionRow[];
}
