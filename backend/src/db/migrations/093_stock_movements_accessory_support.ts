import type { Knex } from 'knex';

/**
 * Extend the stock-movements ledger so accessory stock adjustments can share
 * the same table/flow as rolls, and appear in the adjustment history
 * (REQ-4.1). Roll movements keep `roll_id`; accessory movements carry
 * `accessory_id` with `entity_type = 'accessory'`.
 *
 * Data safety: this migration is non-destructive. It only widens `roll_id`
 * from NOT NULL to nullable (which cannot lose data), adds new columns, an
 * index, a foreign key, and a CHECK constraint. Every pre-existing row keeps
 * `roll_id` populated and receives `entity_type = 'roll'` (column default) +
 * `accessory_id = NULL`, all of which satisfy the CHECK — so no existing row
 * is modified or invalidated. No table is dropped, recreated, or truncated.
 */
export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('stock_movements', (t) => {
    // Widen roll_id to nullable so accessory movements can omit it.
    // (NOT NULL -> NULL is a metadata-only change; no row data is touched.)
    t.bigInteger('roll_id').unsigned().nullable().alter();

    // Discriminator — 'roll' (default; all existing rows) or 'accessory'.
    t.string('entity_type', 16).notNullable().defaultTo('roll').after('roll_id');

    // FK to accessories (null for roll movements).
    t.bigInteger('accessory_id').unsigned().nullable()
      .references('id').inTable('accessories').onDelete('RESTRICT')
      .after('entity_type');

    t.index(['accessory_id']);
  });

  // Roll movements must carry roll_id; accessory movements must carry
  // accessory_id. Existing rows (entity_type='roll', roll_id set,
  // accessory_id NULL) already satisfy this, so ADD CONSTRAINT validates
  // cleanly without changing any data.
  await db.raw(`
    ALTER TABLE stock_movements
    ADD CONSTRAINT chk_stock_movements_entity_type CHECK (
      (entity_type = 'roll'      AND roll_id IS NOT NULL AND accessory_id IS NULL)
      OR
      (entity_type = 'accessory' AND accessory_id IS NOT NULL AND roll_id IS NULL)
    )
  `);
}

/**
 * Reverses only the schema this migration added. It never deletes pre-existing
 * data: every row that existed before this migration has roll_id populated, so
 * restoring NOT NULL succeeds for them. (Rollback is intended before the
 * accessory-adjustment feature is used; if accessory movements — rows with a
 * NULL roll_id — have since been created, remove them first, as re-tightening
 * roll_id to NOT NULL cannot coexist with NULLs.)
 */
export async function down(db: Knex): Promise<void> {
  await db.raw(`ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS chk_stock_movements_entity_type`);

  await db.schema.alterTable('stock_movements', (t) => {
    t.dropIndex(['accessory_id']);
    t.dropColumn('accessory_id');
    t.dropColumn('entity_type');
    t.bigInteger('roll_id').unsigned().notNullable().alter();
  });
}
