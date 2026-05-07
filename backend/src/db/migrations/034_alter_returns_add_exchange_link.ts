import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('returns', (t) => {
    t.bigInteger('exchange_new_invoice_id').unsigned().nullable()
      .references('id').inTable('invoices').onDelete('RESTRICT');
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable('returns', (t) => {
    t.dropColumn('exchange_new_invoice_id');
  });
}
