import type { Knex } from 'knex';

/**
 * «قيد الشحن» — a توب that has been added to a طلبية (draft or sent) is
 * locked as `in_transit` until the shop reviews it. While in transit no
 * تسوية / تقسيم / تعديل / تلف may touch it, so what the factory sent is
 * exactly what the shop receives.
 *
 * Backfill: every in-stock توب currently attached to a draft or
 * pending_approval shipment becomes in_transit. Rollback returns them to
 * in_stock before restoring the original CHECK.
 */
const ORIGINAL = ['in_stock', 'reserved', 'sold', 'damaged', 'sample', 'returned', 'written_off'];
const EXTENDED = [...ORIGINAL, 'in_transit'];

function check(values: string[]): string {
  return `ALTER TABLE rolls ADD CONSTRAINT rolls_status_check CHECK (status IN (${values.map((v) => `'${v}'`).join(',')}))`;
}

export async function up(db: Knex): Promise<void> {
  await db.raw(`ALTER TABLE rolls DROP CONSTRAINT IF EXISTS rolls_status_check`);
  await db.raw(check(EXTENDED));

  await db.raw(`
    UPDATE rolls SET status = 'in_transit', updated_at = NOW()
    WHERE status = 'in_stock'
      AND id IN (
        SELECT sl.roll_id FROM shipment_lines sl
        JOIN shipments s ON s.id = sl.shipment_id
        WHERE s.status IN ('draft', 'pending_approval')
      )
  `);
}

export async function down(db: Knex): Promise<void> {
  await db('rolls').where({ status: 'in_transit' }).update({ status: 'in_stock', updated_at: db.fn.now() });
  await db.raw(`ALTER TABLE rolls DROP CONSTRAINT IF EXISTS rolls_status_check`);
  await db.raw(check(ORIGINAL));
}
