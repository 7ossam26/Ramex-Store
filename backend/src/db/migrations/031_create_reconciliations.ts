import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('reconciliations', (t) => {
    t.bigIncrements('id').primary();
    t.date('recon_date').notNullable();
    t.enu('type', ['cash', 'bank']).notNullable();
    t.bigInteger('bank_account_id').unsigned().nullable()
      .references('id').inTable('bank_accounts').onDelete('RESTRICT');
    t.decimal('expected_balance_egp', 14, 2).notNullable();
    t.decimal('actual_balance_egp', 14, 2).notNullable();
    t.decimal('variance_egp', 14, 2).notNullable();
    t.text('notes_ar').nullable();
    t.bigInteger('actor_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.datetime('created_at').notNullable().defaultTo(knex.fn.now());

    // Bank reconciliations: one per (date, bank_account_id). Bank rows always
    // have bank_account_id NOT NULL, so this works on Postgres as written.
    t.unique(['recon_date', 'type', 'bank_account_id']);
  });

  // Cash reconciliations have bank_account_id NULL, and Postgres treats NULLs
  // as distinct in UNIQUE — so the constraint above won't catch duplicate cash
  // recons on the same date. A partial unique index plugs that gap.
  await knex.raw(`
    CREATE UNIQUE INDEX recons_one_cash_per_date
    ON reconciliations (recon_date)
    WHERE type = 'cash'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('reconciliations');
}
