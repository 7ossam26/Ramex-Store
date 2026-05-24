import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';

// Super Admin is the platform-level bootstrap account — above Owner in privilege.
// Only super_admin can create/manage users and edit the role-permissions matrix.
// PRODUCTION: change the password immediately after first login.
export async function seed(db: Knex): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    const exists = await db('users').where({ username: 'superadmin' }).first();
    if (exists) return;
    await db('users').insert({
      username: 'superadmin',
      password_hash: await bcrypt.hash('ChangeMe123!', 12),
      full_name_ar: 'المشرف العام',
      role: 'super_admin',
      is_active: true,
    });
    return;
  }

  const password_hash = await bcrypt.hash('superadmin1234', 12);
  const existing = await db('users').where({ username: 'superadmin' }).first();
  if (existing) {
    await db('users')
      .where({ id: existing.id })
      .update({ password_hash, role: 'super_admin', is_active: true });
    return;
  }
  await db('users').insert({
    username: 'superadmin',
    password_hash,
    full_name_ar: 'المشرف العام',
    role: 'super_admin',
    is_active: true,
  });
}
