import type { Knex } from 'knex';

// v2 Phase 5 — POS final per-unit price + refundable open-invoice deposit.
// - invoices.status: add 'deposit_refunded' to the CHECK constraint.
// - invoice_lines: add final_price_per_unit (the per-unit cashier input — derived from
//   the resolved per-roll line price; reports compare against reference_price_per_unit).
// - payments.amount_egp: already permits negatives (refunds rely on this); no new
//   constraints needed.
export async function up(db: Knex): Promise<void> {
  // Drop existing CHECK on invoices.status (knex t.enu(...) generated it as
  // `invoices_status_check` for the pg client without useNative).
  await db.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'invoices_status_check'
      ) THEN
        ALTER TABLE invoices DROP CONSTRAINT invoices_status_check;
      END IF;
    END $$;
  `);
  await db.raw(
    `ALTER TABLE invoices ADD CONSTRAINT invoices_status_check ` +
      `CHECK (status IN ('open','closed_pending_pickup','completed','cancelled','deposit_refunded'))`,
  );

  await db.schema.alterTable('invoice_lines', (t) => {
    t.decimal('final_price_per_unit', 12, 2).nullable();
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable('invoice_lines', (t) => {
    t.dropColumn('final_price_per_unit');
  });

  // Wipe any deposit_refunded rows before re-tightening the constraint (system is
  // pre-production; destructive cleanup is acceptable per the v2 plan).
  await db('invoices').where({ status: 'deposit_refunded' }).update({ status: 'cancelled' });

  await db.raw(`ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check`);
  await db.raw(
    `ALTER TABLE invoices ADD CONSTRAINT invoices_status_check ` +
      `CHECK (status IN ('open','closed_pending_pickup','completed','cancelled'))`,
  );
}
