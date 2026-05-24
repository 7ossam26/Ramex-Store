import { db } from '../../db/connection.js';
import { hashPassword } from '../../lib/password.js';

export const findById = (id: number) =>
  db('users')
    .select('id', 'username', 'full_name_ar', 'role', 'is_active', 'created_at')
    .where({ id })
    .first();

export const listAll = () =>
  db('users')
    .select('id', 'username', 'full_name_ar', 'role', 'is_active', 'created_at')
    .orderBy('id');

export async function createUser(data: {
  username: string;
  password: string;
  full_name_ar: string;
  role: string;
}): Promise<{ id: number; username: string; full_name_ar: string; role: string; is_active: boolean; created_at: string }> {
  const existing = await db('users').where({ username: data.username }).first();
  if (existing) throw Object.assign(new Error('USERNAME_TAKEN'), { code: 'USERNAME_TAKEN' });

  const password_hash = await hashPassword(data.password);
  const [row] = await db('users')
    .insert({ username: data.username, password_hash, full_name_ar: data.full_name_ar, role: data.role, is_active: true })
    .returning(['id', 'username', 'full_name_ar', 'role', 'is_active', 'created_at']);
  return row;
}

export async function updateUser(
  id: number,
  data: { full_name_ar?: string; role?: string; password?: string; is_active?: boolean },
): Promise<{ id: number; username: string; full_name_ar: string; role: string; is_active: boolean; created_at: string }> {
  const existing = await db('users').where({ id }).first();
  if (!existing) throw Object.assign(new Error('USER_NOT_FOUND'), { code: 'USER_NOT_FOUND' });

  const update: Record<string, unknown> = {};
  if (data.full_name_ar !== undefined) update.full_name_ar = data.full_name_ar;
  if (data.role !== undefined) update.role = data.role;
  if (data.is_active !== undefined) update.is_active = data.is_active;
  if (data.password !== undefined) update.password_hash = await hashPassword(data.password);
  update.updated_at = new Date();

  const [row] = await db('users')
    .where({ id })
    .update(update)
    .returning(['id', 'username', 'full_name_ar', 'role', 'is_active', 'created_at']);
  return row;
}
