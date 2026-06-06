import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('fabrics', (t) => {
    t.string('category', 32).nullable();
  });
  await db.raw(
    `ALTER TABLE fabrics ADD CONSTRAINT fabrics_category_check CHECK (category IN ('main','rib','accessory'))`,
  );
}

export async function down(db: Knex): Promise<void> {
  await db.raw(`ALTER TABLE fabrics DROP CONSTRAINT IF EXISTS fabrics_category_check`);
  await db.schema.alterTable('fabrics', (t) => {
    t.dropColumn('category');
  });
}
