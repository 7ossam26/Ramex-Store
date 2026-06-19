import { db } from '../../db/connection.js';
import { hashPassword } from '../../lib/password.js';
import { invalidateUserCache } from '../../middleware/concurrent-session.js';

export const findById = (id: number) =>
  db('users')
    .select('id', 'username', 'full_name_ar', 'role', 'is_active', 'created_at',
            'force_password_change', 'last_login_at', 'locked_until', 'failed_login_attempts')
    .where({ id })
    .first();

export const listAll = () =>
  db('users')
    .select('id', 'username', 'full_name_ar', 'role', 'is_active', 'created_at',
            'force_password_change', 'last_login_at', 'locked_until')
    .orderBy('id');

export async function bumpPermissionsRevision(userId: number): Promise<void> {
  await db('users').where({ id: userId }).update({
    permissions_revision: db.raw('permissions_revision + 1'),
  });
  invalidateUserCache(userId);
}

export async function createUser(data: {
  username: string;
  password: string;
  full_name_ar: string;
  role: string;
  force_password_change?: boolean;
}): Promise<{ id: number; username: string; full_name_ar: string; role: string; is_active: boolean; created_at: string }> {
  const existing = await db('users').where({ username: data.username }).first();
  if (existing) throw Object.assign(new Error('USERNAME_TAKEN'), { code: 'USERNAME_TAKEN' });

  const password_hash = await hashPassword(data.password);
  const [row] = await db('users')
    .insert({
      username: data.username,
      password_hash,
      full_name_ar: data.full_name_ar,
      role: data.role,
      is_active: true,
      force_password_change: data.force_password_change ?? false,
    })
    .returning(['id', 'username', 'full_name_ar', 'role', 'is_active', 'created_at']);
  return row;
}

export async function deleteUser(id: number): Promise<void> {
  const existing = await db('users').where({ id }).first();
  if (!existing) throw Object.assign(new Error('USER_NOT_FOUND'), { code: 'USER_NOT_FOUND' });
  if (existing.role === 'super_admin') throw Object.assign(new Error('CANNOT_DELETE_SUPER_ADMIN'), { code: 'CANNOT_DELETE_SUPER_ADMIN' });
  await db('users').where({ id }).delete();
}

export async function resetPassword(
  id: number,
  newPassword: string,
  forceChange = false,
): Promise<{ id: number; username: string; full_name_ar: string; role: string; is_active: boolean; created_at: string }> {
  return updateUser(id, { password: newPassword, force_password_change: forceChange });
}

export async function updateUser(
  id: number,
  data: { full_name_ar?: string; role?: string; password?: string; is_active?: boolean; force_password_change?: boolean },
): Promise<{ id: number; username: string; full_name_ar: string; role: string; is_active: boolean; created_at: string }> {
  const existing = await db('users').where({ id }).first();
  if (!existing) throw Object.assign(new Error('USER_NOT_FOUND'), { code: 'USER_NOT_FOUND' });

  const update: Record<string, unknown> = {};
  if (data.full_name_ar !== undefined) update.full_name_ar = data.full_name_ar;
  if (data.role !== undefined) update.role = data.role;
  if (data.is_active !== undefined) update.is_active = data.is_active;
  if (data.password !== undefined) {
    update.password_hash = await hashPassword(data.password);
    update.permissions_revision = db.raw('permissions_revision + 1');
    invalidateUserCache(id);
  }
  if (data.force_password_change !== undefined) update.force_password_change = data.force_password_change;
  update.updated_at = new Date();

  const [row] = await db('users')
    .where({ id })
    .update(update)
    .returning(['id', 'username', 'full_name_ar', 'role', 'is_active', 'created_at']);
  return row;
}
