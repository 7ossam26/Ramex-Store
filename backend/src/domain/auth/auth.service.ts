import { db } from '../../db/connection.js';
import { verifyPassword } from '../../lib/password.js';
import { signJwt, type Role } from '../../lib/jwt.js';

type LoginResult = {
  token: string;
  user: { id: number; username: string; full_name_ar: string; role: Role };
};

export async function login(
  username: string,
  password: string,
  deviceInfo: string,
  ip: string,
): Promise<LoginResult | null> {
  const user = await db('users').where({ username, is_active: true }).first();
  if (!user) return null;
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return null;

  await db('sessions')
    .where({ user_id: user.id })
    .whereNull('revoked_at')
    .update({ revoked_at: db.fn.now() });

  const { token, jti } = signJwt({ sub: user.id, role: user.role });
  await db('sessions').insert({ user_id: user.id, jwt_jti: jti, device_info: deviceInfo, ip });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      full_name_ar: user.full_name_ar,
      role: user.role,
    },
  };
}

export async function logout(jti: string): Promise<void> {
  await db('sessions').where({ jwt_jti: jti }).whereNull('revoked_at').update({ revoked_at: db.fn.now() });
}
