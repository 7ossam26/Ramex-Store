import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_permission_overrides', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('resource', 64).notNullable();
    t.enu('action', ['read', 'write', 'approve']).notNullable();
    t.boolean('is_allowed').notNullable();
    t.timestamps(true, true);
    t.unique(['user_id', 'resource', 'action']);
    t.index(['user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_permission_overrides');
}
