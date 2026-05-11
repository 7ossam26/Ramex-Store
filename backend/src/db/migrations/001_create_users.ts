import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('users', (t) => {
    t.bigIncrements('id').primary();
    t.string('username', 64).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.string('full_name_ar', 128).notNullable();
    t.enu('role', ['owner', 'shop_seller', 'factory_sender']).notNullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.datetime('created_at').notNullable().defaultTo(db.fn.now());
    t.datetime('updated_at').notNullable().defaultTo(db.fn.now());
  });

  await db.raw(`CREATE INDEX users_role_idx ON users(role)`);
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('users');
}
