import type { Knex } from 'knex';

const WAREHOUSES = ['shop', 'factory', 'damaged_shop'];
const EVENT_TYPES = [
  'factory_in',
  'shipment_out',
  'shipment_in',
  'shipment_reject_back',
  'adjustment',
  'damage',
  'loss_writeoff',
  'sample_set',
  'return_in',
  'sale_out',
  'reserve',
  'unreserve',
];

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('stock_movements', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('roll_id').unsigned().notNullable()
      .references('id').inTable('rolls').onDelete('RESTRICT');
    t.enu('from_warehouse', WAREHOUSES, { useNative: false, enumName: 'stock_movements_from_warehouse_check' }).nullable();
    t.enu('to_warehouse', WAREHOUSES, { useNative: false, enumName: 'stock_movements_to_warehouse_check' }).nullable();
    t.enu('event_type', EVENT_TYPES, { useNative: false, enumName: 'stock_movements_event_type_check' }).notNullable();
    t.string('reference_type', 32).nullable();
    t.bigInteger('reference_id').unsigned().nullable();
    t.bigInteger('actor_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.text('notes_ar').nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());

    t.index(['roll_id', 'created_at']);
    t.index(['reference_type', 'reference_id']);
    t.index(['event_type', 'created_at']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('stock_movements');
}
