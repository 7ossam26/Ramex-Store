import type { Knex } from 'knex';

const TABLES = ['invoices', 'cash_movements', 'bank_movements', 'returns', 'expenses'] as const;

export async function up(knex: Knex): Promise<void> {
  for (const table of TABLES) {
    await knex.schema.alterTable(table, (t) => {
      t.bigInteger('shift_id').unsigned().nullable()
        .references('id').inTable('shifts').onDelete('RESTRICT');
      t.index(['shift_id']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of TABLES) {
    await knex.schema.alterTable(table, (t) => {
      t.dropIndex(['shift_id']);
      t.dropColumn('shift_id');
    });
  }
}
