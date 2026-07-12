import type { Knex } from 'knex';

// The accessory price field is repurposed from a purchase cost into the selling
// price used at the POS. Rename the column on `accessories` only — `rolls` and
// `shipment_lines` keep their own `purchase_price_egp`. Any existing accessory's
// cost value carries over as its new selling price (feature is new; no backfill).
export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('accessories', (t) => {
    t.renameColumn('purchase_price_egp', 'selling_price_egp');
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable('accessories', (t) => {
    t.renameColumn('selling_price_egp', 'purchase_price_egp');
  });
}
