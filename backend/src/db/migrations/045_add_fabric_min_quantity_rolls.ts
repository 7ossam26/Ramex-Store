import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('fabrics', (t) => {
    t.integer('min_quantity_rolls').unsigned().notNullable().defaultTo(2);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable('fabrics', (t) => {
    t.dropColumn('min_quantity_rolls');
  });
}
