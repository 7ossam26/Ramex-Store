import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('cash_drawer', (t) => {
    t.bigIncrements('id').primary();
    t.decimal('current_balance_egp', 14, 2).notNullable().defaultTo(0);
    t.decimal('opening_balance_egp', 14, 2).notNullable().defaultTo(0);
    t.datetime('opening_set_at').nullable();
    t.datetime('last_movement_at').nullable();
  });

  await knex('cash_drawer').insert({
    id: 1,
    current_balance_egp: 0,
    opening_balance_egp: 0,
    opening_set_at: null,
    last_movement_at: null,
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('cash_drawer');
}
