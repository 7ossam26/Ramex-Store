import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('accessories', (t) => {
    t.bigIncrements('id').primary();
    t.string('internal_barcode', 32).notNullable().unique();
    t.string('name_ar', 255).notNullable();
    t.integer('qty_in_stock').notNullable().defaultTo(0);
    t.decimal('purchase_price_egp', 10, 2).nullable();
    t.text('notes_ar').nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.bigInteger('created_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);

    t.index(['internal_barcode']);
    t.index(['name_ar']);
    t.index(['is_active']);
  });

  // Add accessory_barcode_seq to the shared sequences table
  await db('db_sequences').insert({ name: 'accessory_barcode_seq', last_value: 0 });
}

export async function down(db: Knex): Promise<void> {
  await db('db_sequences').where({ name: 'accessory_barcode_seq' }).delete();
  await db.schema.dropTableIfExists('accessories');
}
