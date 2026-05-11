import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('stocktakes', (t) => {
    t.bigIncrements('id').primary();
    t.string('stocktake_no', 32).notNullable();
    t.enu('mode', ['roll_level', 'aggregate']).notNullable();
    t.enu('warehouse', ['shop', 'factory', 'damaged_shop']).notNullable();
    t.bigInteger('created_by_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.datetime('started_at').notNullable();
    t.datetime('completed_at').nullable();
    t.enu('status', ['open', 'completed', 'cancelled']).notNullable().defaultTo('open');
    t.text('notes_ar').nullable();

    t.index(['warehouse', 'status']);
    t.index(['created_by_user_id']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('stocktakes');
}
