import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Extend expenses.paid_from CHECK constraint to include 'instapay'.
  //    Knex enu() without useNative creates a CHECK constraint named
  //    <table>_<column>_check. Drop it and re-add with the new value set.
  await knex.raw(`
    ALTER TABLE expenses
      DROP CONSTRAINT IF EXISTS expenses_paid_from_check,
      ADD CONSTRAINT expenses_paid_from_check
        CHECK (paid_from IN ('cash', 'bank', 'instapay'))
  `);

  // 2. Add last_closed_at to cash_drawer for the manual-close affordance.
  await knex.schema.alterTable('cash_drawer', (t) => {
    t.timestamp('last_closed_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  // Restore original two-value constraint (will fail if instapay rows exist
  // — acceptable for pre-production system).
  await knex.raw(`
    ALTER TABLE expenses
      DROP CONSTRAINT IF EXISTS expenses_paid_from_check,
      ADD CONSTRAINT expenses_paid_from_check
        CHECK (paid_from IN ('cash', 'bank'))
  `);

  await knex.schema.alterTable('cash_drawer', (t) => {
    t.dropColumn('last_closed_at');
  });
}
