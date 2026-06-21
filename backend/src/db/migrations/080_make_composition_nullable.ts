import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('fabrics', (t) => {
    t.json('composition').nullable().alter();
  });
}

export async function down(db: Knex): Promise<void> {
  // Back-fill nulls with empty array before restoring NOT NULL
  await db('fabrics').whereNull('composition').update({ composition: '[]' });
  await db.schema.alterTable('fabrics', (t) => {
    t.json('composition').notNullable().alter();
  });
}
