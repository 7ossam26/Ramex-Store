import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('fabric_color_prices', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('fabric_id').unsigned().notNullable()
      .references('id').inTable('fabrics').onDelete('RESTRICT');
    t.bigInteger('color_id').unsigned().notNullable()
      .references('id').inTable('colors').onDelete('RESTRICT');
    t.decimal('default_price_per_kg', 10, 2).notNullable();
    t.decimal('default_price_per_roll', 10, 2).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
    t.unique(['fabric_id', 'color_id']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('fabric_color_prices');
}
