import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('shifts', (t) => {
    t.bigIncrements('id').primary();
    t.timestamp('opened_at').notNullable().defaultTo(knex.fn.now());
    t.bigInteger('opened_by_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('closed_at').nullable();
    t.bigInteger('closed_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.decimal('opening_cash_balance_egp', 14, 2).notNullable().defaultTo(0);
    t.decimal('closing_cash_balance_egp', 14, 2).nullable();
    t.text('status').notNullable().defaultTo('open');
    t.text('notes_ar').nullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    t.index(['opened_at']);
    t.index(['closed_at']);
    t.index(['status']);
  });

  // Enforce at most one open shift at a time at the database level
  await knex.raw(`
    CREATE UNIQUE INDEX shifts_one_open_at_a_time
      ON shifts (status)
      WHERE status = 'open'
  `);

  await knex.raw(`
    ALTER TABLE shifts
      ADD CONSTRAINT shifts_status_check
      CHECK (status IN ('open', 'closed'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('shifts');
}
