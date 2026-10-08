import type { Knex } from 'knex';

/**
 * «الخزنة» on an expense. A cash expense can now be paid either from the
 * store cash drawer or from the general vault. paid_from stays 'cash' for
 * both; cash_source tells which box was debited. NULL (all pre-existing
 * rows) means the cash drawer.
 */
export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('expenses', (t) => {
    t.string('cash_source', 16).nullable();
  });
  await db.raw(`
    ALTER TABLE expenses
    ADD CONSTRAINT expenses_cash_source_check
    CHECK (cash_source IS NULL OR cash_source IN ('cash_drawer', 'general_vault'))
  `);
}

export async function down(db: Knex): Promise<void> {
  await db.raw('ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_cash_source_check');
  await db.schema.alterTable('expenses', (t) => {
    t.dropColumn('cash_source');
  });
}
