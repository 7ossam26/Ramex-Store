import type { Knex } from 'knex';

/**
 * v3 — Purchase returns (مرتجع مشتريات).
 *
 * A purchase return mirrors a purchase invoice (same line items, extra charges,
 * date) but **credits** the supplier account: it decreases the outstanding
 * balance by its total. Modelled as its own document family, exactly as
 * `supplier_payments` is separate from `supplier_invoices`, so existing invoice
 * / balance / statement queries stay untouched.
 *
 *  - `supplier_returns`      : return headers (PRET-YYYY-NNNNNN internal number).
 *  - `supplier_return_lines` : free-text line items, cascading on return delete.
 *  - `supplier_return_sequence` : per-year PRET counter (mirrors supplier_invoice_sequence).
 *
 * Money columns are `decimal(14,2)` and the currency is denormalized onto the
 * header, matching supplier_invoices. `amount_egp` is kept equal to `total` for
 * symmetry with invoices/payments (the balance formula sums `amount_egp`).
 */
export async function up(knex: Knex): Promise<void> {
  // ── supplier_returns ─────────────────────────────────────────────────────────
  await knex.schema.createTable('supplier_returns', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('supplier_id').notNullable().references('id').inTable('suppliers');
    t.string('return_no', 128).nullable(); // optional external reference
    t.string('internal_no', 32).nullable(); // PRET-YYYY-NNNNNN
    t.date('return_date').notNullable();
    t.decimal('amount_egp', 14, 2).notNullable(); // kept == total (mirrors invoices)
    t.decimal('subtotal', 14, 2).notNullable().defaultTo(0);
    t.decimal('extra_charges', 14, 2).notNullable().defaultTo(0);
    t.decimal('total', 14, 2).notNullable().defaultTo(0);
    t.string('currency', 3).notNullable().defaultTo('EGP');
    t.text('notes_ar').nullable();
    t.bigInteger('created_by_user_id').notNullable().references('id').inTable('users');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(
    'ALTER TABLE supplier_returns ADD CONSTRAINT supplier_returns_amount_positive CHECK (amount_egp > 0)',
  );
  await knex.schema.raw(
    'ALTER TABLE supplier_returns ADD CONSTRAINT supplier_returns_extra_charges_check CHECK (extra_charges >= 0)',
  );
  await knex.schema.raw(
    `ALTER TABLE supplier_returns ADD CONSTRAINT supplier_returns_currency_check CHECK (currency IN ('EGP','RMB'))`,
  );
  await knex.schema.raw('CREATE INDEX supplier_returns_supplier_idx ON supplier_returns(supplier_id)');

  // ── supplier_return_lines ────────────────────────────────────────────────────
  await knex.schema.createTable('supplier_return_lines', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('supplier_return_id')
      .notNullable()
      .references('id')
      .inTable('supplier_returns')
      .onDelete('CASCADE');
    t.text('description').notNullable();
    t.decimal('quantity', 14, 3).notNullable();
    t.string('unit', 8).notNullable();
    t.decimal('unit_price', 14, 2).notNullable();
    t.decimal('line_total', 14, 2).notNullable();
    t.index(['supplier_return_id']);
  });
  await knex.schema.raw(
    `ALTER TABLE supplier_return_lines ADD CONSTRAINT supplier_return_lines_quantity_check CHECK (quantity > 0)`,
  );
  await knex.schema.raw(
    `ALTER TABLE supplier_return_lines ADD CONSTRAINT supplier_return_lines_unit_check CHECK (unit IN ('kg','meter','roll','piece'))`,
  );
  await knex.schema.raw(
    `ALTER TABLE supplier_return_lines ADD CONSTRAINT supplier_return_lines_unit_price_check CHECK (unit_price >= 0)`,
  );

  // ── supplier_return_sequence (PRET per-year counter) ─────────────────────────
  await knex.schema.createTable('supplier_return_sequence', (t) => {
    t.integer('year').primary();
    t.integer('next_no').notNullable().defaultTo(1);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('supplier_return_lines');
  await knex.schema.dropTableIfExists('supplier_returns');
  await knex.schema.dropTableIfExists('supplier_return_sequence');
}
