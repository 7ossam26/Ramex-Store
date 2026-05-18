import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  // Roll selling price is no longer set at creation — it's entered at shipment receive.
  // Relax NOT NULL so تنوب added by the factory user can sit price-less until Ziad receives.
  await db.raw('ALTER TABLE rolls ALTER COLUMN selling_price_egp DROP NOT NULL');

  // Shipment lines now carry the receive-time selling price the shop seller enters
  // when accepting each روول. Stays NULL for pending/rejected lines.
  await db.schema.alterTable('shipment_lines', (t) => {
    t.decimal('selling_price_egp', 10, 2).nullable();
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable('shipment_lines', (t) => {
    t.dropColumn('selling_price_egp');
  });
  // Restore NOT NULL only if no existing rows have NULL — otherwise this would fail in prod;
  // in dev we expect the wipe to have run first.
  await db.raw('ALTER TABLE rolls ALTER COLUMN selling_price_egp SET NOT NULL');
}
