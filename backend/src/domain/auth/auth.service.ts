import { db } from '../../db/connection.js';
import { verifyPassword, hashPassword } from '../../lib/password.js';
import { signJwt, type Role } from '../../lib/jwt.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

type LoginResult = {
  token: string;
  user: { id: number; username: string; full_name_ar: string; role: Role };
  forcePasswordChange: boolean;
};

export type LoginError =
  | { code: 'INVALID_CREDENTIALS' }
  | { code: 'ACCOUNT_LOCKED'; lockedUntil: Date };

export async function login(
  username: string,
  password: string,
  deviceInfo: string,
  ip: string,
): Promise<LoginResult | LoginError> {
  const user = await db('users').where({ username, is_active: true }).first();
  if (!user) return { code: 'INVALID_CREDENTIALS' };

  // Check lockout
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return { code: 'ACCOUNT_LOCKED', lockedUntil: new Date(user.locked_until) };
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    const attempts = (user.failed_login_attempts ?? 0) + 1;
    const lockedUntil =
      attempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
        : null;
    await db('users').where({ id: user.id }).update({
      failed_login_attempts: attempts,
      locked_until: lockedUntil,
    });
    return { code: 'INVALID_CREDENTIALS' };
  }

  // Reset lockout + update last_login_at
  await db('users').where({ id: user.id }).update({
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: db.fn.now(),
  });

  // Revoke all existing sessions (single-session enforcement)
  await db('sessions')
    .where({ user_id: user.id })
    .whereNull('revoked_at')
    .update({ revoked_at: db.fn.now() });

  const { token, jti } = signJwt({
    sub: user.id,
    role: user.role,
    perm_rev: user.permissions_revision ?? 1,
  });
  await db('sessions').insert({ user_id: user.id, jwt_jti: jti, device_info: deviceInfo, ip });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      full_name_ar: user.full_name_ar,
      role: user.role,
    },
    forcePasswordChange: user.force_password_change ?? false,
  };
}

export async function logout(jti: string): Promise<void> {
  await db('sessions').where({ jwt_jti: jti }).whereNull('revoked_at').update({ revoked_at: db.fn.now() });
}

export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { error: string }> {
  const user = await db('users').where({ id: userId }).first();
  if (!user) return { error: 'USER_NOT_FOUND' };

  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) return { error: 'INVALID_CREDENTIALS' };

  const hash = await hashPassword(newPassword);
  await db('users').where({ id: userId }).update({
    password_hash: hash,
    force_password_change: false,
    permissions_revision: db.raw('permissions_revision + 1'),
  });

  // Revoke all sessions so the user gets a fresh token without force_password_change
  await db('sessions').where({ user_id: userId }).whereNull('revoked_at').update({ revoked_at: db.fn.now() });

  return { ok: true };
}
