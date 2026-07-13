import type { Knex } from 'knex';

/**
 * v3 — Add اللون (color) to purchase invoice / return line items.
 *
 * The fabric-ledger statement export needs a dedicated color column; until now
 * color was only ever embedded as free text inside `description`. Nullable,
 * no backfill — existing lines simply render blank in the new column.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('supplier_invoice_lines', (t) => {
    t.string('color', 64).nullable();
  });
  await knex.schema.alterTable('supplier_return_lines', (t) => {
    t.string('color', 64).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('supplier_return_lines', (t) => {
    t.dropColumn('color');
  });
  await knex.schema.alterTable('supplier_invoice_lines', (t) => {
    t.dropColumn('color');
  });
}
