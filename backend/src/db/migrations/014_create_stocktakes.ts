import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('stocktakes', (t) => {
    t.bigIncrements('id').primary();
    t.string('stocktake_no', 32).notNullable();
    t.enu('mode', ['roll_level', 'aggregate'], {
      useNative: false,
      enumName: 'stocktake_mode',
    }).notNullable();
    t.enu('warehouse', ['shop', 'factory', 'damaged_shop'], {
      useNative: false,
      enumName: 'stocktake_warehouse',
    }).notNullable();
    t.bigInteger('created_by_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('started_at', { useTz: true }).notNullable();
    t.timestamp('completed_at', { useTz: true }).nullable();
    t.enu('status', ['open', 'completed', 'cancelled'], {
      useNative: false,
      enumName: 'stocktake_status',
    }).notNullable().defaultTo('open');
    t.text('notes_ar').nullable();

    t.index(['warehouse', 'status']);
    t.index(['created_by_user_id']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('stocktakes');
}
