import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rolls', (t) => {
    t.decimal('weight_kg', 10, 3).nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rolls', (t) => {
    t.decimal('weight_kg', 10, 3).notNullable().alter();
  });
}
