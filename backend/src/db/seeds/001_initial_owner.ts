import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';

export async function seed(db: Knex): Promise<void> {
  const exists = await db('users').where({ username: 'owner' }).first();
  if (exists) return;
  await db('users').insert({
    username: 'owner',
    password_hash: await bcrypt.hash('ChangeMe123!', 12),
    full_name_ar: 'المالك',
    role: 'owner',
    is_active: true,
  });
}
