import type { RequestHandler } from 'express';
import { db } from '../db/connection.js';

// Short-lived cache to avoid hitting users table on every request.
// { userId → { sign_out_after, permissions_revision, cachedAt } }
const userCache = new Map<number, { sign_out_after: Date | null; permissions_revision: number; cachedAt: number }>();
const CACHE_TTL_MS = 30_000;

function getCachedUser(userId: number) {
  const entry = userCache.get(userId);
  if (entry && Date.now() - entry.cachedAt < CACHE_TTL_MS) return entry;
  return null;
}

async function fetchUserMeta(userId: number) {
  const cached = getCachedUser(userId);
  if (cached) return cached;

  const row = await db('users')
    .where({ id: userId })
    .select('sign_out_after', 'permissions_revision')
    .first();

  if (!row) return null;

  const entry = {
    sign_out_after: row.sign_out_after ? new Date(row.sign_out_after) : null,
    permissions_revision: row.permissions_revision ?? 1,
    cachedAt: Date.now(),
  };
  userCache.set(userId, entry);
  return entry;
}

export function invalidateUserCache(userId: number) {
  userCache.delete(userId);
}

export const requireActiveSession: RequestHandler = async (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const row = await db('sessions')
    .where({ jwt_jti: req.user.jti, user_id: req.user.sub })
    .whereNull('revoked_at')
    .first();

  if (!row) {
    res.status(401).json({ error: 'session revoked' });
    return;
  }

  // Check sign_out_after and perm_rev from user row
  const meta = await fetchUserMeta(req.user.sub);
  if (meta) {
    if (meta.sign_out_after && req.user.iat !== undefined) {
      const signOutAfterSec = Math.floor(meta.sign_out_after.getTime() / 1000);
      if (req.user.iat < signOutAfterSec) {
        res.status(401).json({ error: 'SESSION_INVALIDATED' });
        return;
      }
    }

    if (req.user.perm_rev !== undefined && req.user.perm_rev !== meta.permissions_revision) {
      res.status(401).json({ error: 'PERMISSIONS_CHANGED' });
      return;
    }
  }

  await db('sessions').where({ id: row.id }).update({ last_seen_at: db.fn.now() });
  next();
};
