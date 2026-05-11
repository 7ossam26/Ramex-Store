import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('suppliers', (t) => {
    t.bigIncrements('id').primary();
    t.string('arabic_name', 128).notNullable();
    t.string('english_name', 128).nullable();
    t.text('arabic_warning_text').nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.bigInteger('created_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.datetime('created_at').notNullable().defaultTo(db.fn.now());
    t.datetime('updated_at').notNullable().defaultTo(db.fn.now());
    t.index(['is_active']);
  });

  await db.schema.alterTable('colors', (t) => {
    t.string('english_name', 128).nullable();
    t.bigInteger('created_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
  });

  await db.schema.createTable('fabric_grades', (t) => {
    t.bigIncrements('id').primary();
    t.string('arabic_name', 128).notNullable().unique();
    t.string('english_name', 128).nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.bigInteger('created_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.datetime('created_at').notNullable().defaultTo(db.fn.now());
    t.datetime('updated_at').notNullable().defaultTo(db.fn.now());
    t.index(['is_active']);
  });

  await db.schema.createTable('compositions', (t) => {
    t.bigIncrements('id').primary();
    t.string('arabic_name', 128).notNullable().unique();
    t.string('english_name', 128).nullable();
    t.text('description').nullable();
    t.json('breakdown').nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.bigInteger('created_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.datetime('created_at').notNullable().defaultTo(db.fn.now());
    t.datetime('updated_at').notNullable().defaultTo(db.fn.now());
    t.index(['is_active']);
  });

  await db.schema.createTable('brands', (t) => {
    t.bigIncrements('id').primary();
    t.string('arabic_name', 128).notNullable().unique();
    t.string('english_name', 128).nullable();
    t.text('product_line').nullable();
    t.bigInteger('supplier_id').unsigned().nullable()
      .references('id').inTable('suppliers').onDelete('RESTRICT');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.bigInteger('created_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.datetime('created_at').notNullable().defaultTo(db.fn.now());
    t.datetime('updated_at').notNullable().defaultTo(db.fn.now());
    t.index(['is_active']);
    t.index(['supplier_id']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('brands');
  await db.schema.dropTableIfExists('compositions');
  await db.schema.dropTableIfExists('fabric_grades');
  await db.schema.alterTable('colors', (t) => {
    t.dropForeign(['created_by_user_id']);
    t.dropColumn('english_name');
    t.dropColumn('created_by_user_id');
  });
  await db.schema.dropTableIfExists('suppliers');
}
