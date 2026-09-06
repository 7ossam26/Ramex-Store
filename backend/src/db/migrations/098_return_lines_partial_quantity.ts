import type { Knex } from 'knex';

/**
 * Support partial-quantity returns for roll/fabric lines. `returned_quantity`
 * / `returned_unit` record how much of the original line this particular
 * return_lines row covers. NULL on legacy rows (and on every accessory row,
 * which stays whole-line via qty_pieces) means "the whole invoice line" and
 * is resolved through resolveInvoiceRollQuantity — the same explicit-legacy
 * fallback convention migration 096 established for invoice_lines.
 */
export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('return_lines', (t) => {
    t.decimal('returned_quantity', 10, 3).nullable();
    t.string('returned_unit', 8).nullable();
  });

  await db.raw(`
    ALTER TABLE return_lines
    ADD CONSTRAINT chk_return_lines_returned_quantity CHECK (
      (returned_quantity IS NULL AND returned_unit IS NULL)
      OR
      (
        item_type = 'roll'
        AND returned_quantity > 0
        AND returned_unit IN ('kg', 'meter')
      )
    )
  `);
}

export async function down(db: Knex): Promise<void> {
  await db.raw(`ALTER TABLE return_lines DROP CONSTRAINT IF EXISTS chk_return_lines_returned_quantity`);
  await db.schema.alterTable('return_lines', (t) => {
    t.dropColumn('returned_unit');
    t.dropColumn('returned_quantity');
  });
}
