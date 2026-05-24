import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cash_drawer', (t) => {
    t.dropColumn('last_closed_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cash_drawer', (t) => {
    t.timestamp('last_closed_at').nullable();
  });
}
