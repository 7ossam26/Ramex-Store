import type { Knex } from 'knex';

/**
 * Migration 104 — Shop → Factory stock requests («طلبات الأتواب»).
 *
 * A stock request is its OWN entity. It is linked to zero or more ordinary
 * shipments through the new nullable `shipments.stock_request_id`; shipments,
 * shipment_lines, rolls and stock_movements keep their exact semantics.
 *
 * ADDITIVE ONLY:
 *   - new tables, one nullable column on `shipments`, two UNIQUE constraints
 *     (always true for existing rows: they include the primary key) and one
 *     deferred integrity trigger that only fires for shipments that carry a
 *     stock_request_id (none of the existing ones);
 *   - no existing column, enum, constraint or row is altered or rewritten;
 *   - existing shipments keep stock_request_id = NULL (no backfill).
 *
 * RESERVATION is only a row in stock_request_items. rolls.status is NOT
 * changed when a top is requested (it stays factory `in_stock`); it becomes
 * `in_transit` only when the factory scans it onto a shipment draft.
 *
 * INTEGRITY ENFORCED BY THE DATABASE (not only by services):
 *   - one ACTIVE reservation per توب (partial unique index);
 *   - an item's shipment, line and roll must agree with each other, and the
 *     shipment must belong to the item's request (composite foreign keys);
 *   - packing/dispatched items always point at a shipment line, others never;
 *   - a line on a request shipment must have a request item (deferred trigger);
 *   - a replacement chain stays inside one request and is linear;
 *   - item history rows are append-only;
 *   - if a sale / damage / adjustment takes a reserved top out of factory
 *     stock, the reservation is released in the SAME transaction (trigger),
 *     so there is no race window;
 *   - the request status has a single SQL definition (stock_request_derived_status).
 *
 * ROLLBACK NEVER DELETES USER DATA: down() refuses (throws) as soon as any
 * stock request, or any shipment linked to one, exists.
 */

const DERIVED_STATUS_FN = `
CREATE OR REPLACE FUNCTION stock_request_derived_status(p_request_id bigint) RETURNS text AS $$
  SELECT CASE
    WHEN t.total = 0                                      THEN 'open'
    WHEN t.total = t.cancelled                            THEN 'cancelled'
    WHEN t.open_items > 0 AND (t.dispatched + t.unavailable) > 0 THEN 'in_progress'
    WHEN t.open_items > 0                                 THEN 'open'
    WHEN t.pending_review > 0                             THEN 'awaiting_review'
    ELSE 'completed'
  END
  FROM (
    SELECT
      count(*)                                                                  AS total,
      count(*) FILTER (WHERE i.status = 'cancelled')                            AS cancelled,
      count(*) FILTER (WHERE i.status IN ('requested', 'packing'))              AS open_items,
      count(*) FILTER (WHERE i.status = 'dispatched')                           AS dispatched,
      count(*) FILTER (WHERE i.status = 'unavailable')                          AS unavailable,
      count(*) FILTER (WHERE i.status = 'dispatched' AND sl.status = 'pending') AS pending_review
    FROM stock_request_items i
    LEFT JOIN shipment_lines sl ON sl.id = i.shipment_line_id
    WHERE i.request_id = p_request_id
  ) t
$$ LANGUAGE sql STABLE;
`;

// A reserved (status = 'requested') top that leaves factory stock for any reason
// (sold, reserved for an invoice, damaged, sample, written off, moved…) can no
// longer be sent: mark the item unavailable, keep the history, audit it.
const RELEASE_RESERVATION_FN = `
CREATE OR REPLACE FUNCTION trg_rolls_release_stock_request_reservations() RETURNS trigger AS $$
DECLARE
  r record;
  v_reason text;
BEGIN
  IF NEW.warehouse = 'factory' AND NEW.status IN ('in_stock', 'in_transit') THEN
    RETURN NULL;
  END IF;

  v_reason := CASE
    WHEN NEW.warehouse <> 'factory' THEN 'التوب لم يعد في مخزن المصنع'
    WHEN NEW.status = 'sold'        THEN 'تم بيع التوب'
    WHEN NEW.status = 'reserved'    THEN 'التوب محجوز لفاتورة'
    WHEN NEW.status = 'damaged'     THEN 'التوب تالف'
    WHEN NEW.status = 'sample'      THEN 'التوب خرج كعينة'
    WHEN NEW.status = 'returned'    THEN 'التوب مرتجع'
    WHEN NEW.status = 'written_off' THEN 'التوب مشطوب'
    ELSE 'تغيرت حالة التوب'
  END;

  FOR r IN
    SELECT id, request_id FROM stock_request_items
    WHERE roll_id = NEW.id AND status = 'requested'
    FOR NO KEY UPDATE
  LOOP
    UPDATE stock_request_items
       SET status = 'unavailable',
           unavailable_reason_ar = v_reason || ' (تلقائي)',
           unavailable_by_user_id = NULL,
           unavailable_at = now(),
           updated_at = now()
     WHERE id = r.id;

    INSERT INTO stock_request_item_events (item_id, request_id, event_type, from_status, to_status, actor_user_id, note_ar)
    VALUES (r.id, r.request_id, 'auto_unavailable', 'requested', 'unavailable', NULL, v_reason || ' (تلقائي)');

    -- lock order everywhere: roll -> item -> request (request row LAST, never first)
    PERFORM 1 FROM stock_requests WHERE id = r.request_id FOR NO KEY UPDATE;
    UPDATE stock_requests
       SET status = stock_request_derived_status(r.request_id), updated_at = now()
     WHERE id = r.request_id;

    INSERT INTO audit_log (user_id, action, entity, entity_id, after_json, severity)
    VALUES (NULL, 'auto_mark_request_item_unavailable', 'stock_request_item', r.id::text,
            json_build_object('roll_id', NEW.id, 'roll_status', NEW.status, 'roll_warehouse', NEW.warehouse, 'reason', v_reason),
            'medium');
  END LOOP;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
`;

const LINKED_LINE_FN = `
CREATE OR REPLACE FUNCTION trg_request_shipment_line_needs_item() RETURNS trigger AS $$
BEGIN
  -- the line may already be gone again inside the same transaction
  IF NOT EXISTS (SELECT 1 FROM shipment_lines WHERE id = NEW.id) THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM shipments s WHERE s.id = NEW.shipment_id AND s.stock_request_id IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM stock_request_items i WHERE i.shipment_line_id = NEW.id) THEN
    RAISE EXCEPTION 'shipment line % belongs to a stock-request shipment but has no request item', NEW.id
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
`;

const EVENTS_APPEND_ONLY_FN = `
CREATE OR REPLACE FUNCTION trg_stock_request_item_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'stock_request_item_events is append-only' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
`;

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('stock_request_sequence', (t) => {
    t.integer('year').primary();
    t.integer('next_no').notNullable().defaultTo(1);
  });

  await db.schema.createTable('stock_requests', (t) => {
    t.bigIncrements('id').primary();
    t.string('request_no', 32).notNullable().unique(); // REQ-YYYY-NNNNNN
    // Maintained by stock_request_derived_status(); never edited by hand.
    t.enu('status', ['open', 'in_progress', 'awaiting_review', 'completed', 'cancelled']).notNullable().defaultTo('open');
    t.bigInteger('requested_by_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.text('notes_ar').nullable();
    t.bigInteger('cancelled_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('cancelled_at', { useTz: true }).nullable();
    t.text('cancel_reason_ar').nullable();
    t.timestamps(true, true);

    t.index(['status']);
    t.index(['requested_by_user_id']);
  });

  // Link from the existing shipments table (nullable, no backfill).
  await db.schema.alterTable('shipments', (t) => {
    t.bigInteger('stock_request_id').unsigned().nullable()
      .references('id').inTable('stock_requests').onDelete('RESTRICT');
    t.index(['stock_request_id']);
  });

  // Targets for the composite foreign keys below. Both include the primary key,
  // so they hold trivially for every existing row.
  await db.raw(`ALTER TABLE shipments ADD CONSTRAINT uq_shipments_id_stock_request UNIQUE (id, stock_request_id)`);
  await db.raw(`ALTER TABLE shipment_lines ADD CONSTRAINT uq_shipment_lines_id_shipment_roll UNIQUE (id, shipment_id, roll_id)`);

  await db.schema.createTable('stock_request_items', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('request_id').unsigned().notNullable()
      .references('id').inTable('stock_requests').onDelete('RESTRICT');
    t.bigInteger('roll_id').unsigned().notNullable()
      .references('id').inTable('rolls').onDelete('RESTRICT');
    t.enu('status', ['requested', 'packing', 'dispatched', 'unavailable', 'cancelled']).notNullable().defaultTo('requested');

    // Which shipment / line carried this item (composite FKs added below). The
    // accept/reject outcome is READ from shipment_lines.status, never copied.
    t.bigInteger('shipment_id').unsigned().nullable();
    t.bigInteger('shipment_line_id').unsigned().nullable();

    // Replacement / retry chain. The replaced item is never modified.
    t.bigInteger('replaces_item_id').unsigned().nullable();

    t.text('unavailable_reason_ar').nullable();
    t.bigInteger('unavailable_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('unavailable_at', { useTz: true }).nullable();
    t.bigInteger('cancelled_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('cancelled_at', { useTz: true }).nullable();
    t.bigInteger('added_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);

    t.index(['request_id']);
    t.index(['shipment_id']);
    t.index(['roll_id']);
    t.unique(['id', 'request_id']);
  });

  await db.raw(`
    ALTER TABLE stock_request_items
      -- the shipment must be a shipment OF THIS request
      ADD CONSTRAINT fk_sri_shipment_request
        FOREIGN KEY (shipment_id, request_id) REFERENCES shipments (id, stock_request_id) ON DELETE RESTRICT,
      -- the line must be a line of that shipment AND for that roll
      ADD CONSTRAINT fk_sri_shipment_line
        FOREIGN KEY (shipment_line_id, shipment_id, roll_id) REFERENCES shipment_lines (id, shipment_id, roll_id) ON DELETE RESTRICT,
      -- a replacement stays inside the same request
      ADD CONSTRAINT fk_sri_replaces
        FOREIGN KEY (replaces_item_id, request_id) REFERENCES stock_request_items (id, request_id) ON DELETE RESTRICT,
      ADD CONSTRAINT chk_sri_ship_pair
        CHECK ((shipment_id IS NULL) = (shipment_line_id IS NULL)),
      -- packing / dispatched items always sit on a shipment line; the others never do
      ADD CONSTRAINT chk_sri_ship_fields
        CHECK ((status IN ('packing', 'dispatched')) = (shipment_id IS NOT NULL AND shipment_line_id IS NOT NULL)),
      -- «غير متوفر» must always carry a reason
      ADD CONSTRAINT chk_sri_unavailable_reason
        CHECK (status <> 'unavailable' OR (unavailable_reason_ar IS NOT NULL AND length(btrim(unavailable_reason_ar)) > 0)),
      ADD CONSTRAINT chk_sri_not_self_replacement
        CHECK (replaces_item_id IS NULL OR replaces_item_id <> id)
  `);

  // Double-reservation guard: a توب can have at most ONE active request item.
  await db.raw(`
    CREATE UNIQUE INDEX ux_stock_request_items_active_roll
      ON stock_request_items (roll_id)
      WHERE status IN ('requested', 'packing')
  `);
  // One line carries one item; an item is replaced at most once (linear chain).
  await db.raw(`CREATE UNIQUE INDEX ux_sri_shipment_line ON stock_request_items (shipment_line_id) WHERE shipment_line_id IS NOT NULL`);
  await db.raw(`CREATE UNIQUE INDEX ux_sri_replaces_once ON stock_request_items (replaces_item_id) WHERE replaces_item_id IS NOT NULL`);

  // One open draft per request at a time (the factory keeps loading one vehicle).
  await db.raw(`
    CREATE UNIQUE INDEX ux_shipments_one_draft_per_request
      ON shipments (stock_request_id)
      WHERE status = 'draft' AND stock_request_id IS NOT NULL
  `);

  // Complete, append-only history of every item.
  await db.schema.createTable('stock_request_item_events', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('item_id').unsigned().notNullable()
      .references('id').inTable('stock_request_items').onDelete('RESTRICT');
    t.bigInteger('request_id').unsigned().notNullable()
      .references('id').inTable('stock_requests').onDelete('RESTRICT');
    t.string('event_type', 40).notNullable();
    t.string('from_status', 16).nullable();
    t.string('to_status', 16).nullable();
    t.bigInteger('actor_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.text('note_ar').nullable();
    // plain numbers on purpose: history must survive a draft being deleted
    t.bigInteger('shipment_id').unsigned().nullable();
    t.bigInteger('shipment_line_id').unsigned().nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());

    t.index(['item_id', 'id']);
    t.index(['request_id', 'id']);
  });

  await db.raw(EVENTS_APPEND_ONLY_FN);
  await db.raw(`
    CREATE TRIGGER trg_stock_request_item_events_append_only
      BEFORE UPDATE OR DELETE ON stock_request_item_events
      FOR EACH ROW EXECUTE FUNCTION trg_stock_request_item_events_append_only()
  `);

  await db.raw(DERIVED_STATUS_FN);
  await db.raw(RELEASE_RESERVATION_FN);
  await db.raw(`
    CREATE TRIGGER trg_rolls_release_stock_request_reservations
      AFTER UPDATE OF status, warehouse ON rolls
      FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.warehouse IS DISTINCT FROM NEW.warehouse)
      EXECUTE FUNCTION trg_rolls_release_stock_request_reservations()
  `);

  await db.raw(LINKED_LINE_FN);
  await db.raw(`
    CREATE CONSTRAINT TRIGGER trg_request_shipment_line_needs_item
      AFTER INSERT ON shipment_lines
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION trg_request_shipment_line_needs_item()
  `);
}

export async function down(db: Knex): Promise<void> {
  // SAFETY: never silently destroy requests, items, links or history.
  const hasRequests = await db.schema.hasTable('stock_requests');
  const hasLink = await db.schema.hasColumn('shipments', 'stock_request_id');

  const requestCount = hasRequests
    ? Number((await db('stock_requests').count<{ n: string }[]>({ n: '*' }))[0].n)
    : 0;
  const linkedShipments = hasLink
    ? Number((await db('shipments').whereNotNull('stock_request_id').count<{ n: string }[]>({ n: '*' }))[0].n)
    : 0;

  if (requestCount > 0 || linkedShipments > 0) {
    throw new Error(
      `Refusing to roll back migration 104: ${requestCount} stock request(s) and ` +
      `${linkedShipments} linked shipment(s) exist. Nothing was deleted. ` +
      `Resolve or archive them manually before rolling back.`,
    );
  }

  // Both are empty here, so only structure (no user data) is dropped.
  await db.raw('DROP TRIGGER IF EXISTS trg_request_shipment_line_needs_item ON shipment_lines');
  await db.raw('DROP FUNCTION IF EXISTS trg_request_shipment_line_needs_item()');
  await db.raw('DROP TRIGGER IF EXISTS trg_rolls_release_stock_request_reservations ON rolls');
  await db.raw('DROP FUNCTION IF EXISTS trg_rolls_release_stock_request_reservations()');
  await db.schema.dropTableIfExists('stock_request_item_events');
  await db.raw('DROP FUNCTION IF EXISTS trg_stock_request_item_events_append_only()');
  await db.schema.dropTableIfExists('stock_request_items');
  await db.raw('DROP FUNCTION IF EXISTS stock_request_derived_status(bigint)');

  await db.raw('DROP INDEX IF EXISTS ux_shipments_one_draft_per_request');
  await db.raw('ALTER TABLE shipment_lines DROP CONSTRAINT IF EXISTS uq_shipment_lines_id_shipment_roll');
  await db.raw('ALTER TABLE shipments DROP CONSTRAINT IF EXISTS uq_shipments_id_stock_request');
  if (hasLink) {
    await db.schema.alterTable('shipments', (t) => {
      t.dropIndex(['stock_request_id']);
      t.dropColumn('stock_request_id');
    });
  }
  await db.schema.dropTableIfExists('stock_requests');
  await db.schema.dropTableIfExists('stock_request_sequence');
}
