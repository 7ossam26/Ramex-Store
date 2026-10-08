import type { Knex } from 'knex';

/**
 * «جاري الشحن» repair — data only, no schema change.
 *
 * Two kinds of أتواب can be left on an open طلبية in a state the current
 * per-line receive flow cannot finish:
 *
 * 1. Decided under the old flow, never received. Before «قبول» received a
 *    توب on the spot, a decision only flagged the line and stock moved when
 *    the shop pressed «تأكيد الاستلام» — a button that no longer exists. A
 *    line accepted / rejected that way on a طلبية still pending_approval has
 *    no shipment_in / shipment_reject_back movement, its توب is still in the
 *    factory, and it can be neither accepted again nor undone: the طلبية
 *    would close «approved» with the توب never reaching مخزن المحل.
 *
 * 2. Added as in_stock. Migration 100 put every توب on an open طلبية into
 *    `in_transit`, but a server still running the code from before that
 *    change kept adding أتواب to طلبيات as `in_stock`. Those count as
 *    available factory stock while on a shipment, and the shop cannot
 *    receive them.
 *
 * up:   (1) such lines go back to `pending` — the shop decides them again
 *       and the decision then moves the stock exactly once. Lines whose توب
 *       has since left the factory / been sold, or sits on another open
 *       طلبية, are left alone. One audit row per line.
 *       (2) every `in_stock` factory توب with a pending line on a draft /
 *       pending_approval طلبية becomes `in_transit`. One audit row per توب.
 *       No stock movement is written: entering «جاري الشحن» is not a
 *       warehouse move (addRoll writes none either).
 * down: reverses only what this backfill touched (found through its audit
 *       rows) and only while untouched since — still pending on the same
 *       open طلبية with no receive / return movement. Audit rows are kept —
 *       the audit log is never deleted.
 */
const ROLL_ACTION = 'backfill_roll_in_transit';
const LINE_ACTION = 'backfill_reopen_shipment_line';

export async function up(db: Knex): Promise<void> {
  const reopened = await db.raw<{
    rows: Array<{ id: string; shipment_id: string; roll_id: string; prev_status: string; prev_reason: string | null; roll_status: string }>;
  }>(`
    WITH legacy AS (
      SELECT sl.id, sl.shipment_id, sl.roll_id, sl.status AS prev_status, sl.reject_reason_ar AS prev_reason, r.status AS roll_status
      FROM shipment_lines sl
      JOIN shipments s ON s.id = sl.shipment_id
      JOIN rolls r ON r.id = sl.roll_id
      WHERE s.status = 'pending_approval'
        AND sl.status IN ('accepted', 'rejected')
        AND r.warehouse = 'factory' AND r.status IN ('in_transit', 'in_stock')
        AND NOT EXISTS (
          SELECT 1 FROM stock_movements m
          WHERE m.roll_id = sl.roll_id AND m.reference_type = 'shipment' AND m.reference_id = sl.shipment_id
            AND m.event_type IN ('shipment_in', 'shipment_reject_back')
        )
        AND NOT EXISTS (
          SELECT 1 FROM shipment_lines o
          JOIN shipments os ON os.id = o.shipment_id
          WHERE o.roll_id = sl.roll_id AND o.id <> sl.id
            AND o.status = 'pending' AND os.status IN ('draft', 'pending_approval')
        )
    )
    UPDATE shipment_lines sl SET status = 'pending', reject_reason_ar = NULL, updated_at = NOW()
    FROM legacy l
    WHERE sl.id = l.id
    RETURNING sl.id, l.shipment_id, l.roll_id, l.prev_status, l.prev_reason, l.roll_status
  `);

  if (reopened.rows.length > 0) {
    await db('audit_log').insert(
      reopened.rows.map((r) => ({
        user_id: null,
        action: LINE_ACTION,
        entity: 'shipment_line',
        entity_id: String(r.id),
        before_json: JSON.stringify({ status: r.prev_status, reject_reason_ar: r.prev_reason, roll_status: r.roll_status, roll_warehouse: 'factory' }),
        after_json: JSON.stringify({ status: 'pending', shipment_id: Number(r.shipment_id), roll_id: Number(r.roll_id) }),
        severity: 'medium',
      })),
    );
  }

  const { rows } = await db.raw<{ rows: Array<{ id: string; shipment_id: string; line_id: string }> }>(`
    WITH open_line AS (
      SELECT DISTINCT ON (sl.roll_id) sl.roll_id, sl.shipment_id, sl.id AS line_id
      FROM shipment_lines sl
      JOIN shipments s ON s.id = sl.shipment_id
      WHERE sl.status = 'pending' AND s.status IN ('draft', 'pending_approval')
      ORDER BY sl.roll_id, sl.id DESC
    )
    UPDATE rolls r SET status = 'in_transit', updated_at = NOW()
    FROM open_line ol
    WHERE ol.roll_id = r.id AND r.status = 'in_stock' AND r.warehouse = 'factory'
    RETURNING r.id, ol.shipment_id, ol.line_id
  `);

  if (rows.length === 0) return;
  await db('audit_log').insert(
    rows.map((r) => ({
      user_id: null,
      action: ROLL_ACTION,
      entity: 'roll',
      entity_id: String(r.id),
      before_json: JSON.stringify({ status: 'in_stock' }),
      after_json: JSON.stringify({ status: 'in_transit', shipment_id: Number(r.shipment_id), line_id: Number(r.line_id) }),
      severity: 'medium',
    })),
  );
}

export async function down(db: Knex): Promise<void> {
  // Rolls first: their guard needs the line still pending.
  await db.raw(
    `
    UPDATE rolls r SET status = 'in_stock', updated_at = NOW()
    WHERE r.status = 'in_transit'
      AND EXISTS (
        SELECT 1 FROM audit_log a
        JOIN shipment_lines sl ON sl.id = (a.after_json->>'line_id')::bigint
        JOIN shipments s ON s.id = sl.shipment_id
        WHERE a.action = ? AND a.entity = 'roll' AND a.entity_id = r.id::text
          AND sl.roll_id = r.id AND sl.status = 'pending' AND s.status IN ('draft', 'pending_approval')
      )
  `,
    [ROLL_ACTION],
  );

  await db.raw(
    `
    UPDATE shipment_lines sl
    SET status = a.before_json->>'status', reject_reason_ar = a.before_json->>'reject_reason_ar', updated_at = NOW()
    FROM audit_log a, shipments s
    WHERE a.action = ? AND a.entity = 'shipment_line' AND a.entity_id = sl.id::text
      AND s.id = sl.shipment_id AND s.status = 'pending_approval'
      AND sl.status = 'pending'
      AND NOT EXISTS (
        SELECT 1 FROM stock_movements m
        WHERE m.roll_id = sl.roll_id AND m.reference_type = 'shipment' AND m.reference_id = sl.shipment_id
          AND m.event_type IN ('shipment_in', 'shipment_reject_back')
      )
  `,
    [LINE_ACTION],
  );
}
