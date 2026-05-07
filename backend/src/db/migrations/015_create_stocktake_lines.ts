import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('stocktake_lines', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('stocktake_id').unsigned().notNullable()
      .references('id').inTable('stocktakes').onDelete('CASCADE');
    t.bigInteger('roll_id').unsigned().nullable()
      .references('id').inTable('rolls').onDelete('RESTRICT');
    t.bigInteger('fabric_id').unsigned().nullable()
      .references('id').inTable('fabrics').onDelete('RESTRICT');
    t.bigInteger('color_id').unsigned().nullable()
      .references('id').inTable('colors').onDelete('RESTRICT');
    t.integer('expected_count').nullable();
    t.integer('actual_count').nullable();
    t.decimal('expected_weight_kg', 10, 3).nullable();
    t.decimal('actual_weight_kg', 10, 3).nullable();
    t.decimal('variance', 10, 3).nullable();
    t.text('notes_ar').nullable();

    t.index(['stocktake_id']);
    t.index(['roll_id']);
    t.index(['fabric_id', 'color_id']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('stocktake_lines');
}
