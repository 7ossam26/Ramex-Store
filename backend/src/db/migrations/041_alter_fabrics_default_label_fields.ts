import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('fabrics', (t) => {
    t.integer('default_width_cm').unsigned().nullable();
    t.bigInteger('default_grade_id').unsigned().nullable()
      .references('id').inTable('fabric_grades').onDelete('SET NULL');
    t.bigInteger('default_color_id').unsigned().nullable()
      .references('id').inTable('colors').onDelete('SET NULL');
    t.bigInteger('default_composition_id').unsigned().nullable()
      .references('id').inTable('compositions').onDelete('SET NULL');
    t.bigInteger('default_brand_id').unsigned().nullable()
      .references('id').inTable('brands').onDelete('SET NULL');
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable('fabrics', (t) => {
    t.dropForeign(['default_grade_id']);
    t.dropForeign(['default_color_id']);
    t.dropForeign(['default_composition_id']);
    t.dropForeign(['default_brand_id']);
  });
  await db.schema.alterTable('fabrics', (t) => {
    t.dropColumn('default_width_cm');
    t.dropColumn('default_grade_id');
    t.dropColumn('default_color_id');
    t.dropColumn('default_composition_id');
    t.dropColumn('default_brand_id');
  });
}
