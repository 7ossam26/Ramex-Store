import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('invoices', (t) => {
    t.bigIncrements('id').primary();
    t.string('invoice_no', 32).notNullable().unique();
    t.bigInteger('customer_id').unsigned().notNullable()
      .references('id').inTable('customers').onDelete('RESTRICT');
    t.bigInteger('cashier_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.enu('status', ['open', 'closed_pending_pickup', 'completed', 'cancelled']).notNullable();
    t.decimal('subtotal_egp', 12, 2).notNullable();
    t.decimal('cart_discount_egp', 12, 2).notNullable().defaultTo(0);
    t.decimal('tax_egp', 12, 2).notNullable().defaultTo(0);
    t.decimal('rounding_egp', 6, 2).notNullable().defaultTo(0);
    t.decimal('total_egp', 12, 2).notNullable();
    t.decimal('paid_egp', 12, 2).notNullable().defaultTo(0);
    t.decimal('balance_egp', 12, 2).notNullable();
    t.text('notes_ar').nullable();
    t.datetime('created_at').notNullable().defaultTo(db.fn.now());
    t.datetime('closed_at').nullable();
    t.datetime('pickup_at').nullable();
    t.datetime('cancelled_at').nullable();
    t.text('cancelled_reason_ar').nullable();

    t.index(['status', 'created_at']);
    t.index(['customer_id', 'created_at']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('invoices');
}
