import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.raw(`ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0`);
  await db.raw(`ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until timestamptz NULL`);
  await db.raw(`ALTER TABLE users ADD COLUMN IF NOT EXISTS force_password_change boolean NOT NULL DEFAULT false`);
  await db.raw(`ALTER TABLE users ADD COLUMN IF NOT EXISTS sign_out_after timestamptz NULL`);
  await db.raw(`ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions_revision integer NOT NULL DEFAULT 1`);
  await db.raw(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz NULL`);
}

export async function down(db: Knex): Promise<void> {
  await db.raw(`ALTER TABLE users DROP COLUMN IF EXISTS failed_login_attempts`);
  await db.raw(`ALTER TABLE users DROP COLUMN IF EXISTS locked_until`);
  await db.raw(`ALTER TABLE users DROP COLUMN IF EXISTS force_password_change`);
  await db.raw(`ALTER TABLE users DROP COLUMN IF EXISTS sign_out_after`);
  await db.raw(`ALTER TABLE users DROP COLUMN IF EXISTS permissions_revision`);
  await db.raw(`ALTER TABLE users DROP COLUMN IF EXISTS last_login_at`);
}
