import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('settings', (t) => {
    t.string('key', 64).primary();
    t.jsonb('value_json').notNullable();
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
    t.bigInteger('updated_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('settings');
}
