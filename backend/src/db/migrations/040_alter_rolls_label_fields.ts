import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('rolls', (t) => {
    t.string('supplier_order_no', 64).nullable();
    t.integer('top_number').unsigned().nullable();
    t.integer('width_cm').unsigned().nullable();
    t.bigInteger('grade_id').unsigned().nullable()
      .references('id').inTable('fabric_grades').onDelete('RESTRICT');
    t.bigInteger('composition_id').unsigned().nullable()
      .references('id').inTable('compositions').onDelete('RESTRICT');
    t.bigInteger('brand_id').unsigned().nullable()
      .references('id').inTable('brands').onDelete('RESTRICT');
    t.index(['grade_id']);
    t.index(['composition_id']);
    t.index(['brand_id']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable('rolls', (t) => {
    t.dropForeign(['grade_id']);
    t.dropForeign(['composition_id']);
    t.dropForeign(['brand_id']);
  });
  await db.schema.alterTable('rolls', (t) => {
    t.dropIndex(['grade_id']);
    t.dropIndex(['composition_id']);
    t.dropIndex(['brand_id']);
    t.dropColumn('supplier_order_no');
    t.dropColumn('top_number');
    t.dropColumn('width_cm');
    t.dropColumn('grade_id');
    t.dropColumn('composition_id');
    t.dropColumn('brand_id');
  });
}
