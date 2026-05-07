import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('shipment_lines', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('shipment_id').unsigned().notNullable()
      .references('id').inTable('shipments').onDelete('CASCADE');
    t.bigInteger('roll_id').unsigned().notNullable()
      .references('id').inTable('rolls').onDelete('RESTRICT');
    t.decimal('factory_purchase_price_egp', 10, 2).nullable();
    t.enu('status', ['pending', 'accepted', 'rejected'], {
      useNative: false,
      enumName: 'shipment_line_status',
    }).notNullable().defaultTo('pending');
    t.text('reject_reason_ar').nullable();
    t.timestamps(true, true);

    t.unique(['shipment_id', 'roll_id']);
    t.index(['status']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('shipment_lines');
}
