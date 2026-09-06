import type { Knex } from 'knex';

// Snapshot the roll quantity/unit used by the sale. Historical rows stay NULL
// and are resolved from the linked roll by the API's explicit legacy fallback.
export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('invoice_lines', (t) => {
    t.decimal('sold_quantity', 10, 3).nullable();
    t.string('sold_unit', 8).nullable();
  });

  await db.raw(`
    ALTER TABLE invoice_lines
    ADD CONSTRAINT chk_invoice_lines_sold_quantity CHECK (
      (sold_quantity IS NULL AND sold_unit IS NULL)
      OR
      (
        item_type = 'roll'
        AND sold_quantity > 0
        AND sold_unit IN ('kg', 'meter')
      )
    )
  `);
}

export async function down(db: Knex): Promise<void> {
  await db.raw(`ALTER TABLE invoice_lines DROP CONSTRAINT IF EXISTS chk_invoice_lines_sold_quantity`);
  await db.schema.alterTable('invoice_lines', (t) => {
    t.dropColumn('sold_unit');
    t.dropColumn('sold_quantity');
  });
}
