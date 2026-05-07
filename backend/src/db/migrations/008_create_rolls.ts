import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.raw(`CREATE TYPE roll_status AS ENUM ('in_stock','reserved','sold','damaged','sample','returned','written_off')`);
  await db.raw(`CREATE TYPE roll_warehouse AS ENUM ('shop','factory','damaged_shop')`);
  await db.raw(`CREATE SEQUENCE IF NOT EXISTS roll_barcode_seq START 1`);

  await db.schema.createTable('rolls', (t) => {
    t.bigIncrements('id').primary();
    t.string('internal_barcode', 32).notNullable().unique();
    t.string('external_barcode', 64).nullable();
    t.bigInteger('fabric_id').unsigned().notNullable()
      .references('id').inTable('fabrics').onDelete('RESTRICT');
    t.bigInteger('color_id').unsigned().notNullable()
      .references('id').inTable('colors').onDelete('RESTRICT');
    t.string('roll_sr_no', 32).nullable();
    t.string('order_no', 32).nullable();
    t.decimal('weight_kg', 10, 3).notNullable();
    t.decimal('purchase_price_egp', 10, 2).nullable();
    t.decimal('selling_price_egp', 10, 2).notNullable();
    t.specificType('status', 'roll_status').notNullable().defaultTo('in_stock');
    t.specificType('warehouse', 'roll_warehouse').notNullable();
    t.boolean('is_visible_at_pos').notNullable().defaultTo(true);
    t.timestamp('received_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
  });

  await db.raw(`CREATE INDEX rolls_fabric_color_status_idx ON rolls(fabric_id, color_id, status)`);
  await db.raw(`CREATE INDEX rolls_warehouse_status_idx ON rolls(warehouse, status)`);
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('rolls');
  await db.raw(`DROP SEQUENCE IF EXISTS roll_barcode_seq`);
  await db.raw(`DROP TYPE IF EXISTS roll_warehouse`);
  await db.raw(`DROP TYPE IF EXISTS roll_status`);
}
