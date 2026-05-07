import { db } from '../../db/connection.js';

export const findById = (id: number) =>
  db('users')
    .select('id', 'username', 'full_name_ar', 'role', 'is_active', 'created_at')
    .where({ id })
    .first();

export const listAll = () =>
  db('users')
    .select('id', 'username', 'full_name_ar', 'role', 'is_active', 'created_at')
    .orderBy('id');
