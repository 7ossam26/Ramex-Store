import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('return_sequence', (t) => {
    t.integer('year').primary();
    t.integer('next_no').notNullable().defaultTo(1);
  });

  await db.schema.createTable('returns', (t) => {
    t.bigIncrements('id').primary();
    t.string('return_no', 32).notNullable().unique();
    t.bigInteger('original_invoice_id').unsigned().notNullable()
      .references('id').inTable('invoices').onDelete('RESTRICT');
    t.bigInteger('customer_id').unsigned().notNullable()
      .references('id').inTable('customers').onDelete('RESTRICT');
    t.bigInteger('created_by_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('processed_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
    t.decimal('total_refund_egp', 12, 2).notNullable();
    t.enu('refund_method', ['cash', 'instapay', 'customer_credit'], {
      useNative: false,
      enumName: 'returns_refund_method_check',
    }).notNullable();
    t.bigInteger('bank_account_id').unsigned().nullable()
      .references('id').inTable('bank_accounts').onDelete('RESTRICT');
    t.text('notes_ar').nullable();
    t.enu('kind', ['refund', 'exchange'], {
      useNative: false,
      enumName: 'returns_kind_check',
    }).notNullable();

    t.index(['original_invoice_id']);
    t.index(['customer_id', 'processed_at']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('returns');
  await db.schema.dropTableIfExists('return_sequence');
}
