import type { Knex } from 'knex';

const ROLES = "'owner', 'shop_seller', 'factory_sender', 'super_admin'";
const ROLES_WITHOUT_SUPER = "'owner', 'shop_seller', 'factory_sender'";

export async function up(db: Knex): Promise<void> {
  await db.raw(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await db.raw(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (${ROLES}))`);

  await db.raw(`ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_check`);
  await db.raw(`ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_check CHECK (role IN (${ROLES}))`);
}

export async function down(db: Knex): Promise<void> {
  await db.raw(`DELETE FROM users WHERE role = 'super_admin'`);
  await db.raw(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await db.raw(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (${ROLES_WITHOUT_SUPER}))`);

  await db.raw(`DELETE FROM role_permissions WHERE role = 'super_admin'`);
  await db.raw(`ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_check`);
  await db.raw(`ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_check CHECK (role IN (${ROLES_WITHOUT_SUPER}))`);
}
