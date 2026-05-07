import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('invoice_sequence', (t) => {
    t.integer('year').primary();
    t.integer('next_no').notNullable().defaultTo(1);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('invoice_sequence');
}
