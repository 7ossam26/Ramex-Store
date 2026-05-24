import { db } from '../../db/connection.js';

const _cache = new Map<string, { allowed: boolean; expiresAt: number }>();
const TTL = 60_000;

/** Check if a role/user is allowed to perform an action on a resource.
 *  Owner and super_admin are unconditionally allowed. Per-user overrides
 *  take precedence over role defaults when userId is provided. */
export async function can(
  role: string,
  resource: string,
  action: string,
  userId?: number,
): Promise<boolean> {
  if (role === 'super_admin') return true;

  // Check per-user override first
  if (userId !== undefined) {
    const overrideKey = `user:${userId}:${resource}:${action}`;
    const overrideCached = _cache.get(overrideKey);
    if (overrideCached && Date.now() <= overrideCached.expiresAt) {
      if (overrideCached.allowed !== null) return overrideCached.allowed;
    } else {
      const override = await db('user_permission_overrides')
        .where({ user_id: userId, resource, action })
        .select('is_allowed')
        .first() as { is_allowed: boolean } | undefined;
      if (override !== undefined) {
        const allowed = Boolean(override.is_allowed);
        _cache.set(overrideKey, { allowed, expiresAt: Date.now() + TTL });
        return allowed;
      }
    }
  }

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

export function invalidateUserCache(userId: number): void {
  for (const key of _cache.keys()) {
    if (key.startsWith(`user:${userId}:`)) _cache.delete(key);
  }
}

export type PermissionRow = {
  id: number;
  role: string;
  resource: string;
  action: string;
  is_allowed: boolean;
};

export type OverrideRow = {
  id: number;
  user_id: number;
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

/** Compute the merged effective permissions for a single user (role defaults + personal overrides). */
export async function getEffectivePermissionsForUser(
  userId: number,
  role: string,
): Promise<Record<string, Record<string, boolean>>> {
  const [rolePerms, overrides] = await Promise.all([
    db('role_permissions').where({ role }) as unknown as PermissionRow[],
    db('user_permission_overrides').where({ user_id: userId }) as unknown as OverrideRow[],
  ]);
  const effective: Record<string, Record<string, boolean>> = {};
  for (const row of rolePerms) {
    if (!effective[row.resource]) effective[row.resource] = {};
    effective[row.resource][row.action] = Boolean(row.is_allowed);
  }
  for (const ov of overrides) {
    if (!effective[ov.resource]) effective[ov.resource] = {};
    effective[ov.resource][ov.action] = Boolean(ov.is_allowed);
  }
  return effective;
}

export async function getOverridesForUser(userId: number): Promise<OverrideRow[]> {
  return db('user_permission_overrides')
    .where({ user_id: userId })
    .orderBy('resource')
    .orderBy('action') as unknown as OverrideRow[];
}

export async function bulkUpsertOverridesForUser(
  userId: number,
  updates: Array<{ resource: string; action: string; is_allowed: boolean | null }>,
): Promise<void> {
  await db.transaction(async (trx) => {
    for (const u of updates) {
      if (u.is_allowed === null) {
        // null means "revert to role default" — delete the override
        await trx('user_permission_overrides')
          .where({ user_id: userId, resource: u.resource, action: u.action })
          .delete();
      } else {
        const exists = await trx('user_permission_overrides')
          .where({ user_id: userId, resource: u.resource, action: u.action })
          .first();
        if (exists) {
          await trx('user_permission_overrides')
            .where({ user_id: userId, resource: u.resource, action: u.action })
            .update({ is_allowed: u.is_allowed, updated_at: new Date() });
        } else {
          await trx('user_permission_overrides').insert({
            user_id: userId,
            resource: u.resource,
            action: u.action,
            is_allowed: u.is_allowed,
          });
        }
      }
    }
  });
  invalidateUserCache(userId);
}
