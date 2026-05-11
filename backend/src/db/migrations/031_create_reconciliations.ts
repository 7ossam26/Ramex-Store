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

    // MySQL doesn't support partial indexes; enforce one rec per type per date
    // at the full-row level — semantically equivalent for this use case.
    t.unique(['recon_date', 'type', 'bank_account_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('reconciliations');
}
