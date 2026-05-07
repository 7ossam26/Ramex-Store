import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('shipments', (t) => {
    t.bigIncrements('id').primary();
    t.string('shipment_no', 32).notNullable().unique();
    t.bigInteger('created_by_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('submitted_at', { useTz: true }).nullable();
    t.bigInteger('reviewed_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('reviewed_at', { useTz: true }).nullable();
    t.enu('status', ['draft', 'pending_approval', 'partial_approved', 'approved', 'rejected', 'cancelled'], {
      useNative: false,
      enumName: 'shipment_status',
    }).notNullable().defaultTo('draft');
    t.text('notes_ar').nullable();
    t.timestamps(true, true);

    t.index(['status']);
    t.index(['created_by_user_id']);
  });

  await db.schema.createTable('shipment_sequence', (t) => {
    t.integer('year').primary();
    t.integer('next_no').notNullable().defaultTo(1);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('shipment_sequence');
  await db.schema.dropTableIfExists('shipments');
}
