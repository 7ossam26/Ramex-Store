import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('invoice_status_history', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('invoice_id').unsigned().notNullable()
      .references('id').inTable('invoices').onDelete('RESTRICT');
    // from_status is intentionally TEXT with no CHECK constraint — historical
    // record of prior state which may include legacy values.
    t.text('from_status').nullable();
    t.text('to_status').notNullable();
    t.bigInteger('actor_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.text('notes_ar').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());

    t.index(['invoice_id', 'created_at']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('invoice_status_history');
}
