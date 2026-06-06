/**
 * Migration 074 — Remove supplier_id from shipments.
 *
 * Suppliers and shipments are no longer linked. Supplier balances are managed
 * entirely through manual invoices and payments in the treasury module.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('shipments', (t) => {
    t.dropColumn('supplier_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('shipments', (t) => {
    t.bigInteger('supplier_id').nullable().references('id').inTable('suppliers');
  });
}
