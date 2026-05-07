import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('invoices', (t) => {
    t.timestamp('last_stale_notified_at', { useTz: true }).nullable();
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable('invoices', (t) => {
    t.dropColumn('last_stale_notified_at');
  });
}
