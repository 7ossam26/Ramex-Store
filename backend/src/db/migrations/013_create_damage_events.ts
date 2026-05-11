import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('damage_events', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('roll_id').unsigned().notNullable()
      .references('id').inTable('rolls').onDelete('RESTRICT');
    t.enu('reason_code', [
      'damage_in_transit',
      'damage_in_shop',
      'damage_quality_defect',
      'loss_theft',
      'loss_misplaced',
      'inventory_discrepancy',
      'cutting_sample_loss',
      'other',
    ]).notNullable();
    t.enu('disposition', ['damaged_stock', 'return_to_factory', 'auto_writeoff']).notNullable();
    t.text('notes_ar').nullable();
    t.string('photo_path', 255).nullable();
    t.decimal('valuation_egp', 10, 2).notNullable();
    t.boolean('requires_approval').notNullable().defaultTo(false);
    t.bigInteger('approved_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.datetime('approved_at').nullable();
    t.bigInteger('created_by_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.datetime('created_at').notNullable().defaultTo(db.fn.now());

    t.index(['roll_id']);
    t.index(['reason_code', 'created_at']);
    t.index(['requires_approval']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('damage_events');
}
