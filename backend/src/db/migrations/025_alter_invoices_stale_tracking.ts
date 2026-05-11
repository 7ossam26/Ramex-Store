import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('invoices', (t) => {
    t.datetime('last_stale_notified_at').nullable();
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable('invoices', (t) => {
    t.dropColumn('last_stale_notified_at');
  });
}
