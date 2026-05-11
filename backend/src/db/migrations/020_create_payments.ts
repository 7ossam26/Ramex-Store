import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('payments', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('invoice_id').unsigned().notNullable()
      .references('id').inTable('invoices').onDelete('RESTRICT');
    t.enu('method', ['cash', 'instapay']).notNullable();
    t.decimal('amount_egp', 12, 2).notNullable();
    t.enu('payment_kind', ['deposit', 'final', 'refund']).notNullable();
    // FK to bank_accounts is added in migration 022 once that table exists.
    t.bigInteger('bank_account_id').unsigned().nullable();
    t.text('notes_ar').nullable();
    t.bigInteger('actor_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.datetime('created_at').notNullable().defaultTo(db.fn.now());

    t.index(['invoice_id', 'created_at']);
    t.index(['method', 'created_at']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('payments');
}
