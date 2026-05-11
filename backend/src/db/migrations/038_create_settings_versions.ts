import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('settings_versions', (t) => {
    t.bigIncrements('id').primary();
    t.string('key', 64).notNullable();
    t.json('previous_value_jsonb').nullable();
    t.json('new_value_jsonb').notNullable();
    t.bigInteger('actor_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.datetime('created_at').notNullable().defaultTo(knex.fn.now());

    t.index(['key', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('settings_versions');
}
