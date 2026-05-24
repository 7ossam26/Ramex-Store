import type { Knex } from 'knex';

// v2 Phase 1 — inventory data model foundations.
// - fabrics: unit (kg|meter), supplier_code
// - lots: new table + LT-NNNNNN sequence
// - rolls: lot_id, length_m, reference_price_per_unit, drop purchase_price_egp
export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('fabrics', (t) => {
    t.string('unit', 8).notNullable().defaultTo('kg');
    t.string('supplier_code', 64).nullable();
  });
  await db.raw(`ALTER TABLE fabrics ADD CONSTRAINT fabrics_unit_check CHECK (unit IN ('kg','meter'))`);

  await db.schema.createTable('lots', (t) => {
    t.bigIncrements('id').primary();
    t.string('lot_no', 64).notNullable().unique();
    t.bigInteger('fabric_id').unsigned().notNullable()
      .references('id').inTable('fabrics').onDelete('RESTRICT');
    t.bigInteger('color_id').unsigned().notNullable()
      .references('id').inTable('colors').onDelete('RESTRICT');
    t.text('notes_ar').nullable();
    t.datetime('created_at').notNullable().defaultTo(db.fn.now());
    t.datetime('updated_at').notNullable().defaultTo(db.fn.now());
  });
  await db.raw(`CREATE INDEX lots_fabric_color_idx ON lots(fabric_id, color_id)`);

  await db('db_sequences').insert({ name: 'lot_no_seq', last_value: 0 });

  await db.schema.alterTable('rolls', (t) => {
    t.bigInteger('lot_id').unsigned().nullable()
      .references('id').inTable('lots').onDelete('RESTRICT');
    t.decimal('length_m', 10, 3).nullable();
    t.decimal('reference_price_per_unit', 12, 2).nullable();
  });

  await db.schema.alterTable('rolls', (t) => {
    t.dropColumn('purchase_price_egp');
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable('rolls', (t) => {
    t.decimal('purchase_price_egp', 10, 2).nullable();
  });

  await db.schema.alterTable('rolls', (t) => {
    t.dropColumn('reference_price_per_unit');
    t.dropColumn('length_m');
    t.dropColumn('lot_id');
  });

  await db('db_sequences').where({ name: 'lot_no_seq' }).delete();
  await db.schema.dropTableIfExists('lots');

  await db.raw(`ALTER TABLE fabrics DROP CONSTRAINT IF EXISTS fabrics_unit_check`);
  await db.schema.alterTable('fabrics', (t) => {
    t.dropColumn('supplier_code');
    t.dropColumn('unit');
  });
}
