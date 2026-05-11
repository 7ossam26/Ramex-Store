import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('colors', (t) => {
    t.bigIncrements('id').primary();
    t.string('name_ar', 64).notNullable();
    t.string('code', 16).notNullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.datetime('created_at').notNullable().defaultTo(db.fn.now());
    t.datetime('updated_at').notNullable().defaultTo(db.fn.now());
    t.unique(['name_ar', 'code']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('colors');
}
