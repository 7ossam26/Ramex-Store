import type { Knex } from 'knex';

/**
 * Archive support for materials (خامات).
 *
 * A material can now be removed in one of two ways:
 *   - permanently deleted, when nothing real is attached to it; or
 *   - archived, when it carries business history (sales, returns, shipments,
 *     damage, stocktake) that must stay intact.
 *
 * An archived material keeps appearing in historical screens, invoices,
 * printouts and reports — so its name is marked with a ` (مؤرشف)` suffix at
 * archive time. Every consumer selects `fabrics.name_ar`, so marking the
 * stored name makes the archived state visible everywhere by construction,
 * with no per-report change and nothing that can be missed.
 *
 * Data safety: non-destructive. It adds one nullable column, and rewrites
 * `name_ar` only for rows that are ALREADY `is_active = false` (rows the app
 * already treats as disabled), appending a suffix. No row is deleted and no
 * column is dropped or narrowed. `name_ar` is varchar(128) and is not unique,
 * so the suffix cannot violate a constraint; names too long to fit are
 * truncated to make room.
 */

const SUFFIX = ' (مؤرشف)';

export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('fabrics', (t) => {
    // When the material was archived. NULL = active. Kept alongside
    // `is_active` (which stays the flag every existing query filters on) so
    // the UI can show "مؤرشف في …".
    t.datetime('archived_at').nullable();
  });

  // Backfill: materials disabled before this migration are archived materials.
  // Stamp them and mark their names, skipping any that somehow already carry
  // the suffix so the migration stays idempotent.
  await db.raw(
    `UPDATE fabrics
        SET archived_at = NOW(),
            name_ar = LEFT(name_ar, 128 - CHAR_LENGTH(?)) || ?
      WHERE is_active = false
        AND name_ar NOT LIKE ?`,
    [SUFFIX, SUFFIX, `%${SUFFIX}`],
  );
}

export async function down(db: Knex): Promise<void> {
  // Strip the suffix this migration (and the archive flow) added, so rolling
  // back leaves names exactly as the app displayed them before.
  await db.raw(
    `UPDATE fabrics
        SET name_ar = LEFT(name_ar, CHAR_LENGTH(name_ar) - CHAR_LENGTH(?))
      WHERE name_ar LIKE ?`,
    [SUFFIX, `%${SUFFIX}`],
  );

  await db.schema.alterTable('fabrics', (t) => {
    t.dropColumn('archived_at');
  });
}
