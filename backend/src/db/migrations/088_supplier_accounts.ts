import type { Knex } from 'knex';

/**
 * v3 Phase 1 — Supplier accounts.
 * - suppliers: currency (EGP|RMB, fixed after transactions), signed opening balance + as-of date.
 * - supplier_invoices / supplier_payments: denormalized currency; money widened to (14,2).
 *   (Columns stay named `amount_egp` for continuity — they hold the supplier's own currency,
 *    disambiguated by the `currency` column. Do not rename.)
 * - supplier_invoice_sequence: per-year PINV counter (mirrors invoice_sequence).
 */
export async function up(knex: Knex): Promise<void> {
  // ── suppliers ──────────────────────────────────────────────────────────────
  await knex.schema.alterTable('suppliers', (t) => {
    t.string('currency', 3).notNullable().defaultTo('EGP');
    t.decimal('opening_balance', 14, 2).notNullable().defaultTo(0);
    t.date('opening_balance_date').nullable();
  });
  await knex.raw(`UPDATE suppliers SET currency = 'EGP' WHERE currency IS NULL`);
  await knex.raw(
    `ALTER TABLE suppliers ADD CONSTRAINT suppliers_currency_check CHECK (currency IN ('EGP','RMB'))`,
  );

  // ── supplier_invoices ──────────────────────────────────────────────────────
  await knex.schema.alterTable('supplier_invoices', (t) => {
    t.string('currency', 3).notNullable().defaultTo('EGP');
    t.decimal('amount_egp', 14, 2).notNullable().alter();
  });
  await knex.raw(
    `ALTER TABLE supplier_invoices ADD CONSTRAINT supplier_invoices_currency_check CHECK (currency IN ('EGP','RMB'))`,
  );

  // ── supplier_payments ──────────────────────────────────────────────────────
  await knex.schema.alterTable('supplier_payments', (t) => {
    t.string('currency', 3).notNullable().defaultTo('EGP');
    t.decimal('amount_egp', 14, 2).notNullable().alter();
  });
  await knex.raw(
    `ALTER TABLE supplier_payments ADD CONSTRAINT supplier_payments_currency_check CHECK (currency IN ('EGP','RMB'))`,
  );

  // ── supplier_invoice_sequence (PINV per-year counter) ──────────────────────
  await knex.schema.createTable('supplier_invoice_sequence', (t) => {
    t.integer('year').primary();
    t.integer('next_no').notNullable().defaultTo(1);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('supplier_invoice_sequence');

  await knex.raw('ALTER TABLE supplier_payments DROP CONSTRAINT IF EXISTS supplier_payments_currency_check');
  await knex.schema.alterTable('supplier_payments', (t) => {
    t.dropColumn('currency');
    t.decimal('amount_egp', 12, 2).notNullable().alter();
  });

  await knex.raw('ALTER TABLE supplier_invoices DROP CONSTRAINT IF EXISTS supplier_invoices_currency_check');
  await knex.schema.alterTable('supplier_invoices', (t) => {
    t.dropColumn('currency');
    t.decimal('amount_egp', 12, 2).notNullable().alter();
  });

  await knex.raw('ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_currency_check');
  await knex.schema.alterTable('suppliers', (t) => {
    t.dropColumn('currency');
    t.dropColumn('opening_balance');
    t.dropColumn('opening_balance_date');
  });
}
