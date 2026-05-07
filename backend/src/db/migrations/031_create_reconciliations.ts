import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('reconciliations', (t) => {
    t.bigIncrements('id').primary();
    t.date('recon_date').notNullable();
    t.enu('type', ['cash', 'bank'], { useNative: false, enumName: 'reconciliations_type_check' }).notNullable();
    t.bigInteger('bank_account_id').unsigned().nullable()
      .references('id').inTable('bank_accounts').onDelete('RESTRICT');
    t.decimal('expected_balance_egp', 14, 2).notNullable();
    t.decimal('actual_balance_egp', 14, 2).notNullable();
    t.decimal('variance_egp', 14, 2).notNullable();
    t.text('notes_ar').nullable();
    t.bigInteger('actor_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(['recon_date', 'type', 'bank_account_id']);
  });

  // Partial unique index: one cash reconciliation per date (bank_account_id = NULL)
  await knex.raw(
    `CREATE UNIQUE INDEX recons_one_cash_per_date ON reconciliations (recon_date) WHERE type = 'cash'`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('reconciliations');
}
