import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('invoice_lines', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('invoice_id').unsigned().notNullable()
      .references('id').inTable('invoices').onDelete('RESTRICT');
    t.bigInteger('roll_id').unsigned().notNullable()
      .references('id').inTable('rolls').onDelete('RESTRICT');
    t.decimal('selling_price_egp', 10, 2).notNullable();
    t.decimal('line_discount_egp', 10, 2).notNullable().defaultTo(0);
    t.decimal('line_total_egp', 10, 2).notNullable();

    t.index(['invoice_id']);
    t.index(['roll_id']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('invoice_lines');
}
