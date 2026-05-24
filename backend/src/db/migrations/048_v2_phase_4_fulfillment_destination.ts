import type { Knex } from 'knex';

// v2 Phase 4 — fulfillment destination (shop vs factory direct).
// Per-invoice value set at POS time; gates which warehouse's rolls can be sold.
export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('invoices', (t) => {
    t.string('fulfillment_destination', 32).notNullable().defaultTo('shop');
  });
  await db.raw(
    `ALTER TABLE invoices ADD CONSTRAINT invoices_fulfillment_destination_check ` +
      `CHECK (fulfillment_destination IN ('shop','factory_direct'))`,
  );
  await db.raw(
    `CREATE INDEX invoices_fulfillment_destination_idx ON invoices(fulfillment_destination)`,
  );
}

export async function down(db: Knex): Promise<void> {
  await db.raw(`DROP INDEX IF EXISTS invoices_fulfillment_destination_idx`);
  await db.raw(
    `ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_fulfillment_destination_check`,
  );
  await db.schema.alterTable('invoices', (t) => {
    t.dropColumn('fulfillment_destination');
  });
}
