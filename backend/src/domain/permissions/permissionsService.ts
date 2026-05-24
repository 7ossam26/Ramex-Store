import { db } from '../../db/connection.js';

const _cache = new Map<string, { allowed: boolean; expiresAt: number }>();
const TTL = 60_000;

/** Check if a role is allowed to perform an action on a resource.
 *  Owner is unconditionally allowed (short-circuit before any DB call). */
export async function can(role: string, resource: string, action: string): Promise<boolean> {
  if (role === 'owner' || role === 'super_admin') return true;

  const key = `${role}:${resource}:${action}`;
  const cached = _cache.get(key);
  if (cached && Date.now() <= cached.expiresAt) return cached.allowed;

  const row = await db('role_permissions')
    .where({ role, resource, action })
    .select('is_allowed')
    .first() as { is_allowed: boolean } | undefined;

  const allowed = row ? Boolean(row.is_allowed) : false;
  _cache.set(key, { allowed, expiresAt: Date.now() + TTL });
  return allowed;
}

export function invalidateCache(): void {
  _cache.clear();
}

export type PermissionRow = {
  id: number;
  role: string;
  resource: string;
  action: string;
  is_allowed: boolean;
};

export async function getMatrix(): Promise<PermissionRow[]> {
  return db('role_permissions')
    .orderBy('resource')
    .orderBy('role') as unknown as PermissionRow[];
}

export async function bulkUpdate(
  updates: Array<{ role: string; resource: string; action: string; is_allowed: boolean }>,
): Promise<void> {
  await db.transaction(async (trx) => {
    for (const u of updates) {
      const exists = await trx('role_permissions')
        .where({ role: u.role, resource: u.resource, action: u.action })
        .first();
      if (exists) {
        await trx('role_permissions')
          .where({ role: u.role, resource: u.resource, action: u.action })
          .update({ is_allowed: u.is_allowed });
      } else {
        await trx('role_permissions').insert(u);
      }
    }
  });
  invalidateCache();
}
