import type { Knex } from 'knex';

/**
 * Stocktake resolution support.
 *
 * - `line_kind` distinguishes the snapshot lines taken at start ('expected')
 *   from أتواب scanned during the count that the system had registered
 *   elsewhere / in a non-physical status ('unexpected'). `system_warehouse` /
 *   `system_status` capture the roll's registered state at scan time.
 * - `expected_length_m` / `actual_length_m` carry the quantity for metre-unit
 *   fabrics (the weight columns only fit kg fabrics).
 * - `resolution*` columns record the action chosen per issue line after the
 *   count is completed.
 *
 * Additive only: new nullable / defaulted columns. Every existing row keeps
 * its data and becomes `line_kind = 'expected'` with no resolution. No unique
 * "one open per warehouse" index is added because existing data may already
 * hold duplicate open counts; that rule is enforced in the service.
 */
export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('stocktake_lines', (t) => {
    t.string('line_kind', 16).notNullable().defaultTo('expected');
    t.datetime('scanned_at').nullable();
    t.string('system_warehouse', 16).nullable();
    t.string('system_status', 16).nullable();
    t.decimal('expected_length_m', 10, 3).nullable();
    t.decimal('actual_length_m', 10, 3).nullable();
    t.string('resolution', 32).nullable();
    t.string('resolution_target_warehouse', 16).nullable();
    t.text('resolution_notes_ar').nullable();
    t.bigInteger('resolved_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.datetime('resolved_at').nullable();
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.alterTable('stocktake_lines', (t) => {
    t.dropForeign(['resolved_by_user_id']);
    t.dropColumn('resolved_at');
    t.dropColumn('resolved_by_user_id');
    t.dropColumn('resolution_notes_ar');
    t.dropColumn('resolution_target_warehouse');
    t.dropColumn('resolution');
    t.dropColumn('actual_length_m');
    t.dropColumn('expected_length_m');
    t.dropColumn('system_status');
    t.dropColumn('system_warehouse');
    t.dropColumn('scanned_at');
    t.dropColumn('line_kind');
  });
}
