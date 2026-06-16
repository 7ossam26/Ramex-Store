import type { Knex } from 'knex';

/**
 * Allow advance repayments that are NOT tied to a salary disbursement, so an
 * employee can repay an advance directly (cash handed back or bank transfer in).
 *
 * - hr_advance_repayments.disbursement_id becomes nullable (standalone rows have NULL).
 *   The existing UNIQUE(disbursement_id) is preserved: Postgres treats NULLs as
 *   distinct, so any number of standalone repayments coexist while each
 *   disbursement still maps to at most one repayment.
 * - Add paid_via / bank_account_id / notes_ar to capture how the standalone
 *   repayment was received.
 * - Add the 'advance_repayment' cash event type so the cash inflow can be recorded.
 */

const CASH_EVENT_TYPES_BASE = [
  'sale_payment',
  'deposit_payment',
  'refund',
  'expense',
  'cash_to_bank',
  'owner_withdrawal',
  'opening_balance_set',
  'reconciliation_adjustment',
];

function cashCheckSql(values: string[]): string {
  const list = values.map((v) => `'${v}'`).join(', ');
  return `
    ALTER TABLE cash_movements
      DROP CONSTRAINT IF EXISTS cash_movements_event_type_check,
      ADD CONSTRAINT cash_movements_event_type_check
        CHECK (event_type IN (${list}))
  `;
}

export async function up(knex: Knex): Promise<void> {
  // 1. disbursement_id nullable (raw SQL keeps the FK intact).
  await knex.raw('ALTER TABLE hr_advance_repayments ALTER COLUMN disbursement_id DROP NOT NULL');

  // 2. Capture how a standalone repayment was received.
  await knex.schema.alterTable('hr_advance_repayments', (t) => {
    t.string('paid_via', 32).nullable();
    t.bigInteger('bank_account_id').nullable().references('id').inTable('bank_accounts');
    t.text('notes_ar').nullable();
  });

  // 3. Allow the cash inflow for a cash repayment.
  await knex.raw(cashCheckSql([...CASH_EVENT_TYPES_BASE, 'advance_repayment']));
}

export async function down(knex: Knex): Promise<void> {
  // Remove standalone repayment rows so NOT NULL can be restored.
  await knex('hr_advance_repayments').whereNull('disbursement_id').del();

  // Remove the cash inflows recorded for advance repayments before restoring the constraint.
  await knex('cash_movements').where({ event_type: 'advance_repayment' }).del();

  await knex.raw(cashCheckSql(CASH_EVENT_TYPES_BASE));

  await knex.schema.alterTable('hr_advance_repayments', (t) => {
    t.dropColumn('paid_via');
    t.dropColumn('bank_account_id');
    t.dropColumn('notes_ar');
  });

  await knex.raw('ALTER TABLE hr_advance_repayments ALTER COLUMN disbursement_id SET NOT NULL');
}
