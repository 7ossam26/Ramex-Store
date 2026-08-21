import type { Knex } from 'knex';

/**
 * Add a payment-time discount to invoices.
 *
 * `cart_discount_egp` is fixed at invoice-creation / add-lines time. When the
 * cashier settles an open invoice they may waive part of the remaining balance
 * (rounding it down, forgiving a leftover). That amount is recorded here so it
 * stays separately reportable from the cart discount, and `total_egp` is
 * reduced by it when the final payment is taken.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('invoices', (t) => {
    t.decimal('final_discount_egp', 12, 2).notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('invoices', (t) => {
    t.dropColumn('final_discount_egp');
  });
}
