// Stocktake (الجرد): resume/blocking rules, unexpected scans, measured
// quantities, completion auto-resolution and the post-count resolution
// actions that correct the توب records.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/connection.js';
import { createFabric } from '../src/domain/items/fabrics.service.js';
import { createColor } from '../src/domain/items/colors.service.js';
import { createTopBatch } from '../src/domain/items/tops.service.js';
import {
  cancelStocktake,
  completeStocktake,
  getStocktake,
  recordAggregate,
  recordScan,
  resolveStocktakeLines,
  startStocktake,
  unscanLine,
  updateLineMeasurement,
  StocktakeBlockedError,
} from '../src/domain/inventory/stocktake.service.js';
import { createAdjustment } from '../src/domain/inventory/adjustments.service.js';

const RUN_DB = process.env.RUN_DB_TESTS === '1';
const WH = 'shop' as const;
let actorUserId: number;
let sequence = 0;

function stamp(): string {
  sequence += 1;
  return `${Date.now()}-${sequence}`;
}

/** A kg توب placed directly in a warehouse/status (test setup only). */
async function makeRoll(
  warehouse: string,
  status = 'in_stock',
  weightKg = 10,
): Promise<{ id: number; barcode: string }> {
  const id = stamp();
  const fabric = await createFabric({ name_ar: `قماش جرد ${id}`, width_cm: 150, grade: 'A', unit: 'kg' });
  const color = await createColor({ name_ar: `لون جرد ${id}` });
  const batch = await createTopBatch(
    { fabric: { id: Number(fabric.id) }, rolls: [{ color: { id: Number(color.id) }, weight_kg: weightKg, width_cm: 150 }] },
    actorUserId,
  );
  const rollId = Number(batch.rolls[0].id);
  await db('rolls').where({ id: rollId }).update({ warehouse, status });
  const roll = await db('rolls').where({ id: rollId }).first();
  return { id: rollId, barcode: roll.internal_barcode };
}

/** Leave the warehouse with nothing open or pending, so a new count can start. */
async function clearWarehouse(warehouse: string): Promise<void> {
  const open = await db('stocktakes').where({ warehouse, status: 'open' });
  for (const s of open) await cancelStocktake(Number(s.id), actorUserId);
  const done = await db('stocktakes').where({ warehouse, status: 'completed' }).pluck('id');
  if (done.length) {
    await db('stocktake_lines')
      .whereIn('stocktake_id', done)
      .whereNull('resolution')
      .update({ resolution: 'keep_as_is', resolution_notes_ar: 'test cleanup', resolved_at: db.fn.now() });
  }
}

async function lineFor(stocktakeId: number, rollId: number) {
  const st = await getStocktake(stocktakeId);
  return st!.lines.find((l) => Number(l.roll_id) === rollId);
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as Error).message;
  }
}

describe.skipIf(!RUN_DB).sequential('stocktake', () => {
  beforeAll(async () => {
    const actor = await db('users').whereIn('role', ['owner', 'super_admin']).orderBy('id').first('id');
    if (!actor) throw new Error('TEST_ACTOR_NOT_FOUND');
    actorUserId = Number(actor.id);
  });

  beforeEach(async () => {
    await clearWarehouse(WH);
    await clearWarehouse('damaged_shop');
  });

  afterAll(async () => {
    if (RUN_DB) {
      await clearWarehouse(WH);
      await clearWarehouse('damaged_shop');
      await db.destroy();
    }
  });

  it('snapshot includes every physically-present status, and damaged_shop counts are not empty', async () => {
    const reserved = await makeRoll(WH, 'reserved');
    const sample = await makeRoll(WH, 'sample');
    const sold = await makeRoll(WH, 'sold');
    const damaged = await makeRoll('damaged_shop', 'damaged');

    const st = await startStocktake(actorUserId, 'roll_level', WH);
    expect(await lineFor(st.id, reserved.id)).toBeDefined();
    expect(await lineFor(st.id, sample.id)).toBeDefined();
    expect(await lineFor(st.id, sold.id)).toBeUndefined();

    const dst = await startStocktake(actorUserId, 'roll_level', 'damaged_shop');
    expect(await lineFor(dst.id, damaged.id)).toBeDefined();
  });

  it('blocks a second count while one is open, and the open one stays resumable', async () => {
    const st = await startStocktake(actorUserId, 'roll_level', WH);
    let err: unknown;
    try {
      await startStocktake(actorUserId, 'roll_level', WH);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(StocktakeBlockedError);
    expect((err as StocktakeBlockedError).message).toBe('STOCKTAKE_ALREADY_OPEN');
    expect((err as StocktakeBlockedError).stocktakeId).toBe(st.id);

    const again = await getStocktake(st.id);
    expect(again?.status).toBe('open');

    await cancelStocktake(st.id, actorUserId);
    expect(await code(startStocktake(actorUserId, 'roll_level', WH))).toBe('OK');
  });

  it('records unexpected scans, late arrivals and measurements; undo-scan works', async () => {
    const here = await makeRoll(WH);
    const elsewhere = await makeRoll('factory');
    const st = await startStocktake(actorUserId, 'roll_level', WH);
    const late = await makeRoll(WH); // arrived after the count started

    const a = await recordScan(st.id, actorUserId, here.barcode);
    expect(a.alreadyScanned).toBe(false);
    expect(a.line.issue).toBeNull();
    expect((await recordScan(st.id, actorUserId, here.barcode)).alreadyScanned).toBe(true);

    const b = await recordScan(st.id, actorUserId, elsewhere.barcode);
    expect(b.line.line_kind).toBe('unexpected');
    expect(b.line.system_warehouse).toBe('factory');
    expect(b.line.issue).toBe('unexpected');

    const c = await recordScan(st.id, actorUserId, late.barcode);
    expect(c.line.line_kind).toBe('expected');
    expect(c.line.issue).toBeNull();

    const measured = await updateLineMeasurement(st.id, a.line.id, actorUserId, { actual_weight_kg: 9.5 });
    expect(measured.issue).toBe('quantity_diff');
    expect(measured.qty_diff).toBe(-0.5);

    await unscanLine(st.id, b.line.id, actorUserId);
    expect(await lineFor(st.id, elsewhere.id)).toBeUndefined();
    await unscanLine(st.id, a.line.id, actorUserId);
    const reset = await lineFor(st.id, here.id);
    expect(reset?.actual_count).toBeNull();
    expect(reset?.actual_weight_kg).toBeNull();
  });

  it('completes, auto-resolves أتواب changed during the count, blocks until resolved, then applies actions', async () => {
    const missingElsewhere = await makeRoll(WH);
    const lost = await makeRoll(WH);
    const lighter = await makeRoll(WH, 'in_stock', 10);
    const soldDuring = await makeRoll(WH);
    const fromFactory = await makeRoll('factory');
    const keep = await makeRoll(WH);

    const st = await startStocktake(actorUserId, 'roll_level', WH);
    const l1 = await recordScan(st.id, actorUserId, lighter.barcode);
    await updateLineMeasurement(st.id, l1.line.id, actorUserId, { actual_weight_kg: 8.25 });
    await recordScan(st.id, actorUserId, fromFactory.barcode);
    await db('rolls').where({ id: soldDuring.id }).update({ status: 'sold' });

    await completeStocktake(st.id, actorUserId);

    expect((await lineFor(st.id, soldDuring.id))?.resolution).toBe('changed_during_count');
    expect(await code(startStocktake(actorUserId, 'roll_level', WH))).toBe('STOCKTAKE_PENDING_RESOLUTION');

    const line = async (rollId: number) => (await lineFor(st.id, rollId))!.id;

    expect(await code(resolveStocktakeLines(st.id, actorUserId, [
      { line_id: await line(keep.id), action: 'keep_as_is' },
    ]))).toBe('NOTES_REQUIRED');
    expect(await code(resolveStocktakeLines(st.id, actorUserId, [
      { line_id: await line(missingElsewhere.id), action: 'transfer' },
    ]))).toBe('TARGET_WAREHOUSE_REQUIRED');
    expect(await code(resolveStocktakeLines(st.id, actorUserId, [
      { line_id: await line(lighter.id), action: 'write_off' },
    ]))).toBe('ACTION_NOT_ALLOWED');

    await resolveStocktakeLines(st.id, actorUserId, [
      { line_id: await line(missingElsewhere.id), action: 'transfer', target_warehouse: 'factory' },
      { line_id: await line(lost.id), action: 'write_off' },
      { line_id: await line(lighter.id), action: 'adjust_quantity' },
      { line_id: await line(fromFactory.id), action: 'transfer' },
      { line_id: await line(keep.id), action: 'keep_as_is', notes_ar: 'عند الصباغ' },
    ]);

    const roll = (id: number) => db('rolls').where({ id }).first();
    expect((await roll(missingElsewhere.id)).warehouse).toBe('factory');
    expect((await roll(lost.id)).status).toBe('written_off');
    expect(Number((await roll(lighter.id)).weight_kg)).toBe(8.25);
    expect((await roll(fromFactory.id)).warehouse).toBe(WH);
    expect((await roll(keep.id)).warehouse).toBe(WH);

    const writeoffMove = await db('stock_movements')
      .where({ roll_id: lost.id, reference_type: 'stocktake', reference_id: st.id })
      .first();
    expect(writeoffMove?.event_type).toBe('loss_writeoff');
    const audit = await db('audit_log').where({ action: 'stocktake_resolve', entity: 'roll', entity_id: String(lost.id) }).first();
    expect(audit?.severity).toBe('critical');

    expect(await code(resolveStocktakeLines(st.id, actorUserId, [
      { line_id: await line(keep.id), action: 'keep_as_is', notes_ar: 'مرة أخرى' },
    ]))).toBe('LINE_ALREADY_RESOLVED');

    // أتواب left in the shop by earlier tests are also missing; once every
    // line has an action, a new count may start.
    const rest = (await getStocktake(st.id))!.lines.filter((l) => l.allowed_actions.length > 0);
    if (rest.length) {
      await resolveStocktakeLines(st.id, actorUserId, rest.map((l) => ({
        line_id: l.id, action: 'keep_as_is' as const, notes_ar: 'test',
      })));
    }
    expect(await code(startStocktake(actorUserId, 'roll_level', WH))).toBe('OK');
  });

  it('a found written-off توب can be restored; a found sold توب can only be kept as is', async () => {
    const writtenOff = await makeRoll(WH, 'written_off');
    const sold = await makeRoll(WH, 'sold');
    const st = await startStocktake(actorUserId, 'roll_level', WH);
    const a = await recordScan(st.id, actorUserId, writtenOff.barcode);
    const b = await recordScan(st.id, actorUserId, sold.barcode);
    expect(a.line.allowed_actions).toEqual(['restore_to_stock', 'keep_as_is']);
    expect(b.line.allowed_actions).toEqual(['keep_as_is']);
    await completeStocktake(st.id, actorUserId);

    expect(await code(resolveStocktakeLines(st.id, actorUserId, [
      { line_id: b.line.id, action: 'transfer' },
    ]))).toBe('ACTION_NOT_ALLOWED');

    await resolveStocktakeLines(st.id, actorUserId, [
      { line_id: a.line.id, action: 'restore_to_stock' },
      { line_id: b.line.id, action: 'keep_as_is', notes_ar: 'العميل لم يستلمه' },
    ]);
    const restored = await db('rolls').where({ id: writtenOff.id }).first();
    expect(restored.status).toBe('in_stock');
    expect(restored.is_visible_at_pos).toBe(true);
    expect((await db('rolls').where({ id: sold.id }).first()).status).toBe('sold');
  });

  it('refuses a resolution when the توب changed after completion', async () => {
    const r = await makeRoll(WH);
    const st = await startStocktake(actorUserId, 'roll_level', WH);
    await completeStocktake(st.id, actorUserId);
    await db('rolls').where({ id: r.id }).update({ status: 'sold' });
    const lineId = (await lineFor(st.id, r.id))!.id;
    expect(await code(resolveStocktakeLines(st.id, actorUserId, [
      { line_id: lineId, action: 'write_off' },
    ]))).toBe('LINE_STALE');
  });

  it('تسوية behaviour is unchanged by the shared applyRollPatch helper', async () => {
    const r = await makeRoll(WH);
    await db('rolls').where({ id: r.id }).update({ is_visible_at_pos: false });
    // Weight-only تسوية keeps a deliberate POS hide.
    const mov = await createAdjustment(actorUserId, {
      entity_type: 'roll', roll_id: r.id, new_weight_kg: 7, notes_ar: 'وزن',
    });
    expect(mov.event_type).toBe('adjustment');
    expect(mov.reference_type).toBe('adjustment');
    let row = await db('rolls').where({ id: r.id }).first();
    expect(Number(row.weight_kg)).toBe(7);
    expect(row.is_visible_at_pos).toBe(false);
    // Sample → back to متاح makes it sellable again.
    await createAdjustment(actorUserId, { entity_type: 'roll', roll_id: r.id, new_status: 'sample', notes_ar: 'عينة' });
    await createAdjustment(actorUserId, { entity_type: 'roll', roll_id: r.id, new_status: 'in_stock', notes_ar: 'رجوع' });
    row = await db('rolls').where({ id: r.id }).first();
    expect(row.is_visible_at_pos).toBe(true);
    // Factory exit guard still enforced.
    const f = await makeRoll('factory');
    expect(await code(createAdjustment(actorUserId, {
      entity_type: 'roll', roll_id: f.id, new_warehouse: 'shop', notes_ar: 'x',
    }))).toBe('FACTORY_EXIT_REQUIRES_SHIPMENT');
  });

  it('aggregate: re-saving only the count keeps the weight already entered', async () => {
    const r = await makeRoll(WH);
    const rollRow = await db('rolls').where({ id: r.id }).first();
    const st = await startStocktake(actorUserId, 'aggregate', WH);
    await recordAggregate(st.id, actorUserId, rollRow.fabric_id, rollRow.color_id, 1, 9.75);
    const line = await recordAggregate(st.id, actorUserId, rollRow.fabric_id, rollRow.color_id, 2);
    expect(Number(line.actual_count)).toBe(2);
    expect(Number(line.actual_weight_kg)).toBe(9.75);
    await cancelStocktake(st.id, actorUserId);
  });
});
