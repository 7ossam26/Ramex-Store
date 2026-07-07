import type { Knex } from 'knex';

/**
 * v3 Phase 2 — Line-item purchase invoices.
 *
 * Turns the flat-amount supplier invoice into a detailed document:
 *  - `supplier_invoices` gains an internal PINV number, an extra-charges line,
 *    a due date, and stored `subtotal` / `total`. The legacy `amount_egp` column
 *    is kept for back-compat and is written equal to `total` on every write.
 *  - New `supplier_invoice_lines` holds free-text line items (not linked to
 *    inventory), cascading on invoice delete.
 */
export async function up(knex: Knex): Promise<void> {
  // ── supplier_invoices: document-level columns ──────────────────────────────
  await knex.schema.alterTable('supplier_invoices', (t) => {
    t.string('internal_no', 32).nullable();
    t.decimal('extra_charges', 14, 2).notNullable().defaultTo(0);
    t.date('due_date').nullable();
    t.decimal('subtotal', 14, 2).notNullable().defaultTo(0);
    t.decimal('total', 14, 2).notNullable().defaultTo(0);
  });
  await knex.raw(
    `ALTER TABLE supplier_invoices ADD CONSTRAINT supplier_invoices_extra_charges_check CHECK (extra_charges >= 0)`,
  );
  // Backfill legacy flat-amount invoices so subtotal/total mirror amount_egp.
  await knex.raw(`UPDATE supplier_invoices SET subtotal = amount_egp, total = amount_egp`);

  // ── supplier_invoice_lines ─────────────────────────────────────────────────
  await knex.schema.createTable('supplier_invoice_lines', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('supplier_invoice_id')
      .notNullable()
      .references('id')
      .inTable('supplier_invoices')
      .onDelete('CASCADE');
    t.text('description').notNullable();
    t.decimal('quantity', 14, 3).notNullable();
    t.string('unit', 8).notNullable();
    t.decimal('unit_price', 14, 2).notNullable();
    t.decimal('line_total', 14, 2).notNullable();
    t.index(['supplier_invoice_id']);
  });
  await knex.raw(
    `ALTER TABLE supplier_invoice_lines ADD CONSTRAINT supplier_invoice_lines_quantity_check CHECK (quantity > 0)`,
  );
  await knex.raw(
    `ALTER TABLE supplier_invoice_lines ADD CONSTRAINT supplier_invoice_lines_unit_check CHECK (unit IN ('kg','meter','roll','piece'))`,
  );
  await knex.raw(
    `ALTER TABLE supplier_invoice_lines ADD CONSTRAINT supplier_invoice_lines_unit_price_check CHECK (unit_price >= 0)`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('supplier_invoice_lines');

  await knex.raw('ALTER TABLE supplier_invoices DROP CONSTRAINT IF EXISTS supplier_invoices_extra_charges_check');
  await knex.schema.alterTable('supplier_invoices', (t) => {
    t.dropColumn('internal_no');
    t.dropColumn('extra_charges');
    t.dropColumn('due_date');
    t.dropColumn('subtotal');
    t.dropColumn('total');
  });
}
