import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('return_lines', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('return_id').unsigned().notNullable()
      .references('id').inTable('returns').onDelete('CASCADE');
    t.bigInteger('original_invoice_line_id').unsigned().notNullable()
      .references('id').inTable('invoice_lines').onDelete('RESTRICT');
    t.bigInteger('roll_id').unsigned().notNullable()
      .references('id').inTable('rolls').onDelete('RESTRICT');
    t.decimal('refund_amount_egp', 10, 2).notNullable();
    t.enu('roll_disposition', ['back_to_stock', 'damaged'], {
      useNative: false,
      enumName: 'return_lines_disposition_check',
    }).notNullable().defaultTo('back_to_stock');
    t.text('notes_ar').nullable();

    t.index(['return_id']);
    t.index(['roll_id']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('return_lines');
}
