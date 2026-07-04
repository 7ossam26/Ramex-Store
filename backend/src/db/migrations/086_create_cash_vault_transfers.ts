import type { Knex } from 'knex';

/**
 * Cash Vault Transfer: move confirmed cash from the Store Vault (existing
 * `cash_drawer`) to a new General/Factory Vault. Adds:
 *   - `general_vault` (single-row balance holder, mirrors cash_drawer)
 *   - `general_vault_movements` (audit ledger, mirrors cash_movements)
 *   - `cash_vault_transfers` (pending -> confirmed/rejected/cancelled request)
 *   - `vault_transfer_out` cash event type, so the store-side outflow can be recorded
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
  'advance_repayment',
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
  await knex.schema.createTable('general_vault', (t) => {
    t.bigIncrements('id').primary();
    t.decimal('current_balance_egp', 14, 2).notNullable().defaultTo(0);
    t.datetime('last_movement_at').nullable();
  });

  await knex('general_vault').insert({
    id: 1,
    current_balance_egp: 0,
    last_movement_at: null,
  });

  await knex.schema.createTable('general_vault_movements', (t) => {
    t.bigIncrements('id').primary();
    t.enu('direction', ['in', 'out']).notNullable();
    t.enu('event_type', ['vault_transfer_in', 'vault_transfer_out', 'adjustment']).notNullable();
    t.decimal('amount_egp', 12, 2).notNullable();
    t.string('reference_type', 32).nullable();
    t.bigInteger('reference_id').nullable();
    t.decimal('balance_after_egp', 14, 2).notNullable();
    t.text('notes_ar').nullable();
    t.bigInteger('actor_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.datetime('created_at').notNullable().defaultTo(knex.fn.now());

    t.index(['created_at']);
  });

  await knex.schema.createTable('cash_vault_transfers', (t) => {
    t.bigIncrements('id').primary();
    t.decimal('amount_egp', 14, 2).notNullable();
    t.string('status', 16).notNullable().defaultTo('pending');
    t.text('notes_ar').nullable();
    t.text('reject_reason_ar').nullable();
    t.bigInteger('created_by_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    t.bigInteger('reviewed_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.datetime('reviewed_at').nullable();
    t.bigInteger('cash_movement_id').nullable();
    t.bigInteger('general_vault_movement_id').nullable();

    t.index(['status', 'created_at']);
  });

  await knex.schema.raw(
    "ALTER TABLE cash_vault_transfers ADD CONSTRAINT cash_vault_transfers_amount_positive CHECK (amount_egp > 0)",
  );
  await knex.schema.raw(
    "ALTER TABLE cash_vault_transfers ADD CONSTRAINT cash_vault_transfers_status_check CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled'))",
  );

  await knex.raw(cashCheckSql([...CASH_EVENT_TYPES_BASE, 'vault_transfer_out']));
}

export async function down(knex: Knex): Promise<void> {
  await knex('cash_movements').where({ event_type: 'vault_transfer_out' }).del();
  await knex.raw(cashCheckSql(CASH_EVENT_TYPES_BASE));

  await knex.schema.dropTableIfExists('cash_vault_transfers');
  await knex.schema.dropTableIfExists('general_vault_movements');
  await knex.schema.dropTableIfExists('general_vault');
}
