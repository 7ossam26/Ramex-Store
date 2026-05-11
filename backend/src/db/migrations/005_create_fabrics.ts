import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('fabrics', (t) => {
    t.bigIncrements('id').primary();
    t.string('code', 32).notNullable().unique();
    t.string('name_ar', 128).notNullable();
    t.json('composition').notNullable();
    t.decimal('width_cm', 6, 2).notNullable();
    t.string('grade', 16).notNullable();
    t.text('notes').nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.datetime('created_at').notNullable().defaultTo(db.fn.now());
    t.datetime('updated_at').notNullable().defaultTo(db.fn.now());
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('fabrics');
}
