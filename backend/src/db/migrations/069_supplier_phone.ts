import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('suppliers', (t) => {
    t.string('phone', 20).nullable();
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable('suppliers', (t) => {
    t.dropColumn('phone');
  });
}
