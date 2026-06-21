import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('fabrics', (t) => {
    t.decimal('gsm', 8, 2).nullable();
    t.decimal('mad_m', 8, 2).nullable();
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable('fabrics', (t) => {
    t.dropColumn('gsm');
    t.dropColumn('mad_m');
  });
}
