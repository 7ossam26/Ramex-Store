import type { Knex } from 'knex';

const EXTENDED = [
  'factory_in', 'shipment_out', 'shipment_in', 'shipment_reject_back',
  'adjustment', 'damage', 'loss_writeoff', 'sample_set',
  'return_in', 'sale_out', 'reserve', 'unreserve',
  'shop_to_factory_return',
];

const ORIGINAL = [
  'factory_in', 'shipment_out', 'shipment_in', 'shipment_reject_back',
  'adjustment', 'damage', 'loss_writeoff', 'sample_set',
  'return_in', 'sale_out', 'reserve', 'unreserve',
];

export async function up(db: Knex): Promise<void> {
  const vals = EXTENDED.map((t) => `'${t}'`).join(',');
  await db.raw(`ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_event_type_check`);
  await db.raw(`ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_event_type_check CHECK (event_type IN (${vals}))`);
}

export async function down(db: Knex): Promise<void> {
  const vals = ORIGINAL.map((t) => `'${t}'`).join(',');
  await db.raw(`ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_event_type_check`);
  await db.raw(`ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_event_type_check CHECK (event_type IN (${vals}))`);
}
