import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('settings', (t) => {
    t.string('key', 64).primary();
    t.json('value_json').notNullable();
    t.datetime('updated_at').notNullable().defaultTo(db.fn.now());
    t.bigInteger('updated_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('settings');
}
