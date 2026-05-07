import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('customer_ledger_entries', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('customer_id').unsigned().notNullable()
      .references('id').inTable('customers').onDelete('RESTRICT');
    t.enu('entry_type', ['sale', 'refund', 'payment', 'deposit', 'adjustment'], {
      useNative: false,
      enumName: 'ledger_entry_type',
    }).notNullable();
    t.string('reference_type', 32).nullable();
    t.bigInteger('reference_id').nullable();
    t.decimal('amount_egp', 12, 2).notNullable();
    t.decimal('balance_after_egp', 14, 2).notNullable();
    t.text('notes_ar').nullable();
    t.bigInteger('actor_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());

    t.index(['customer_id', 'created_at']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('customer_ledger_entries');
}
