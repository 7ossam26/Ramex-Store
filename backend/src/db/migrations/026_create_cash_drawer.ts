import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('cash_drawer', (t) => {
    t.bigIncrements('id').primary();
    t.decimal('current_balance_egp', 14, 2).notNullable().defaultTo(0);
    t.decimal('opening_balance_egp', 14, 2).notNullable().defaultTo(0);
    t.timestamp('opening_set_at', { useTz: true }).nullable();
    t.timestamp('last_movement_at', { useTz: true }).nullable();
  });

  await knex.raw(`ALTER TABLE cash_drawer ADD CONSTRAINT cash_drawer_singleton CHECK (id = 1)`);

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
