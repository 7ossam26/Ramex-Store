import type { Knex } from 'knex';

/**
 * Fix the cancelled/returned-invoice status bug: `processReturn` /
 * `processExchange` / the scan-return flows never updated the invoice header,
 * so a fully-refunded invoice kept showing `completed` and stayed counted as
 * fully paid in accounting. This adds a return-state pair on `invoices`
 * (`returned_amount_egp`, `returned_at`) and widens the status CHECK with
 * `returned` / `partially_returned`, following the same additive pattern
 * migration 049 used for `deposit_refunded`.
 *
 * `total_egp` / `paid_egp` / `balance_egp` are left untouched — they remain
 * the historical record of the original sale. The refunded amount lives in
 * the new `returned_amount_egp` column; net position = total_egp − returned_amount_egp.
 */
export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('invoices', (t) => {
    t.decimal('returned_amount_egp', 12, 2).notNullable().defaultTo(0);
    t.datetime('returned_at').nullable();
  });

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
      `CHECK (status IN ('open','closed_pending_pickup','completed','cancelled','deposit_refunded','returned','partially_returned'))`,
  );
}

export async function down(db: Knex): Promise<void> {
  // Pre-production system — collapse any row already in a new status back to
  // `completed` before re-tightening the constraint (mirrors migration 049's
  // down()).
  await db('invoices')
    .whereIn('status', ['returned', 'partially_returned'])
    .update({ status: 'completed' });

  await db.raw(`ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check`);
  await db.raw(
    `ALTER TABLE invoices ADD CONSTRAINT invoices_status_check ` +
      `CHECK (status IN ('open','closed_pending_pickup','completed','cancelled','deposit_refunded'))`,
  );

  await db.schema.alterTable('invoices', (t) => {
    t.dropColumn('returned_at');
    t.dropColumn('returned_amount_egp');
  });
}
