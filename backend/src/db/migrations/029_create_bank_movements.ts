import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('bank_movements', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('bank_account_id').unsigned().notNullable()
      .references('id').inTable('bank_accounts').onDelete('RESTRICT');
    t.enu('direction', ['in', 'out'], { useNative: false, enumName: 'bank_mov_direction_check' }).notNullable();
    t.enu(
      'event_type',
      [
        'instapay_payment',
        'cash_deposit',
        'refund',
        'reconciliation_adjustment',
        'opening_balance_set',
        'other_in',
        'other_out',
      ],
      { useNative: false, enumName: 'bank_mov_event_type_check' },
    ).notNullable();
    t.decimal('amount_egp', 12, 2).notNullable();
    t.string('reference_type', 32).nullable();
    t.bigInteger('reference_id').nullable();
    t.decimal('balance_after_egp', 14, 2).notNullable();
    t.text('notes_ar').nullable();
    t.bigInteger('actor_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['bank_account_id', 'created_at']);
    t.index(['event_type', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('bank_movements');
}
