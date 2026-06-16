import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';

// In production, only insert the bootstrap owner if no owner exists — never
// overwrite an existing user's password. The dev branch uses a memorable
// `admin`/`admin1234` for local work; the original `owner`/`ChangeMe123!`
// pattern is preserved for production so an accidental `db:seed` run on
// prod is a no-op once the real owner has logged in and changed it.
export async function seed(db: Knex): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    const exists = await db('users').where({ username: 'owner' }).first();
    if (exists) return;
    await db('users').insert({
      username: 'owner',
      password_hash: await bcrypt.hash('ChangeMe123!', 12),
      full_name_ar: 'المالك',
      role: 'owner',
      is_active: true,
    });
    return;
  }

  const password_hash = await bcrypt.hash('0000', 12);

  const superadmin = await db('users').where({ username: 'superadmin' }).first();
  if (superadmin) {
    await db('users')
      .where({ id: superadmin.id })
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
