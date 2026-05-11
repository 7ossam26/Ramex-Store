import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('invoices', (t) => {
    t.bigInteger('delivered_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.datetime('delivered_at').nullable();
    t.index(['status']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable('invoices', (t) => {
    t.dropIndex(['status']);
    t.dropColumn('delivered_at');
    t.dropColumn('delivered_by_user_id');
  });
}
