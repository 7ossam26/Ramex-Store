// الطلبيات: «جاري الشحن» lock on أتواب added to a طلبية, review decisions
// taking effect immediately (partial deliveries), undo while untouched, and
// the طلبية closing itself once nothing is pending.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/connection.js';
import { createFabric } from '../src/domain/items/fabrics.service.js';
import { createColor } from '../src/domain/items/colors.service.js';
import { createTopBatch, splitTop } from '../src/domain/items/tops.service.js';
import { updateRoll } from '../src/domain/items/rolls.service.js';
import { createAdjustment } from '../src/domain/inventory/adjustments.service.js';
import { createDamageEvent } from '../src/domain/inventory/damage.service.js';
import { getStockSummary } from '../src/domain/inventory/stockSummary.service.js';
import { listRolls } from '../src/domain/items/rolls.service.js';
import { create as createCustomerRecord } from '../src/domain/customers/customersService.js';
import { createSale } from '../src/domain/sales/invoices.service.js';
import { cancelStocktake, getStocktake, startStocktake, StocktakeBlockedError } from '../src/domain/inventory/stocktake.service.js';
import { up as repairLegacyTransit } from '../src/db/migrations/103_backfill_roll_in_transit.js';
import {
  acceptShipment,
  addRoll,
  createDraft,
  deleteDraft,
  removeLine,
  reviewLine,
  reviewLines,
  submit,
} from '../src/domain/inventory/shipments.service.js';

const RUN_DB = process.env.RUN_DB_TESTS === '1';
let actorUserId: number;
let sequence = 0;

function stamp(): string {
  sequence += 1;
  return `${Date.now()}-${sequence}`;
}

/** A kg توب in the factory, ready to be sent. */
async function makeFactoryRoll(unit: 'kg' | 'meter' = 'kg'): Promise<number> {
  const id = stamp();
  const fabric = await createFabric({ name_ar: `قماش طلبية ${id}`, width_cm: 150, grade: 'A', unit });
  const color = await createColor({ name_ar: `لون طلبية ${id}` });
  const batch = await createTopBatch(
    {
      fabric: { id: Number(fabric.id) },
      rolls: [{ color: { id: Number(color.id) }, weight_kg: 10, ...(unit === 'meter' ? { length_m: 50 } : {}), width_cm: 150 }],
    },
    actorUserId,
  );
  const rollId = Number(batch.rolls[0].id);
  await db('rolls').where({ id: rollId }).update({ warehouse: 'factory', status: 'in_stock' });
  return rollId;
}

/** n kg أتواب of one new fabric/colour in the factory, ready to be sent. */
async function makeFactoryRolls(n: number): Promise<{ fabricId: number; colorId: number; rollIds: number[] }> {
  const id = stamp();
  const fabric = await createFabric({ name_ar: `قماش شحن ${id}`, width_cm: 150, grade: 'A', unit: 'kg' });
  const color = await createColor({ name_ar: `لون شحن ${id}` });
  const batch = await createTopBatch(
    {
      fabric: { id: Number(fabric.id) },
      rolls: Array.from({ length: n }, () => ({ color: { id: Number(color.id) }, weight_kg: 10, width_cm: 150 })),
    },
    actorUserId,
  );
  const rollIds = batch.rolls.map((r) => Number(r.id));
  await db('rolls').whereIn('id', rollIds).update({ warehouse: 'factory', status: 'in_stock' });
  return { fabricId: Number(fabric.id), colorId: Number(color.id), rollIds };
}

/** Inventory-page counts for one fabric/colour. */
async function stock(fabricId: number, colorId: number, warehouse?: 'shop' | 'factory' | 'damaged_shop') {
  const row = (await getStockSummary(warehouse)).find((r) => r.fabric_id === fabricId && r.color_id === colorId);
  return { available: row?.count_in_stock ?? 0, inTransit: row?.count_in_transit ?? 0 };
}

async function shipmentMoves(shipmentId: number, eventType: string): Promise<number> {
  const rows = await db('stock_movements').where({ reference_type: 'shipment', reference_id: shipmentId, event_type: eventType });
  return rows.length;
}

async function rollState(id: number): Promise<{ status: string; warehouse: string }> {
  const r = await db('rolls').where({ id }).first('status', 'warehouse');
  return { status: r.status, warehouse: r.warehouse };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as Error & { code?: string }).code ?? (e as Error).message;
  }
}

/** Draft with the given أتواب; returns shipment and line ids in roll order. */
async function draftWith(rollIds: number[]): Promise<{ shipmentId: number; lineIds: number[] }> {
  const shipment = await createDraft(actorUserId, {});
  const lineIds: number[] = [];
  for (const rollId of rollIds) {
    const { line } = await addRoll(shipment.id, actorUserId, { roll_id: rollId });
    lineIds.push(Number(line.id));
  }
  return { shipmentId: Number(shipment.id), lineIds };
}

describe.skipIf(!RUN_DB).sequential('shipment review + in-transit lock', () => {
  beforeAll(async () => {
    const actor = await db('users').whereIn('role', ['owner', 'super_admin']).orderBy('id').first('id');
    if (!actor) throw new Error('TEST_ACTOR_NOT_FOUND');
    actorUserId = Number(actor.id);
  });

  afterAll(async () => {
    if (RUN_DB) await db.destroy();
  });

  it('a توب is «قيد الشحن» from the moment it is added, and released when removed or the draft is deleted', async () => {
    const a = await makeFactoryRoll();
    const b = await makeFactoryRoll();
    const { shipmentId, lineIds } = await draftWith([a, b]);
    expect(await rollState(a)).toEqual({ status: 'in_transit', warehouse: 'factory' });

    await removeLine(shipmentId, lineIds[0], actorUserId);
    expect((await rollState(a)).status).toBe('in_stock');
    expect((await rollState(b)).status).toBe('in_transit');

    await deleteDraft(shipmentId, actorUserId);
    expect((await rollState(b)).status).toBe('in_stock');
  });

  it('blocks تسوية, تقسيم, تعديل and تلف on a توب «قيد الشحن»', async () => {
    const a = await makeFactoryRoll();
    const { shipmentId } = await draftWith([a]);

    expect(await code(createAdjustment(actorUserId, {
      entity_type: 'roll', roll_id: a, new_weight_kg: 5, notes_ar: 'test',
    }))).toBe('ROLL_IN_TRANSIT');
    expect(await code(splitTop(a, 3, actorUserId))).toBe('ROLL_IN_TRANSIT');
    expect(await code(updateRoll(a, { weight_kg: 5 }))).toBe('ROLL_IN_TRANSIT');
    expect(await code(createDamageEvent(actorUserId, {
      roll_id: a, reason_code: 'damage_in_shop', disposition: 'damaged_stock',
    }))).toBe('ROLL_IN_TRANSIT');

    const r = await db('rolls').where({ id: a }).first('weight_kg');
    expect(Number(r.weight_kg)).toBe(10);
    await deleteDraft(shipmentId, actorUserId);
  });

  it('a metre توب without a length cannot be added to a طلبية', async () => {
    const m = await makeFactoryRoll('meter');
    await db('rolls').where({ id: m }).update({ length_m: null });
    const shipment = await createDraft(actorUserId, {});
    expect(await code(addRoll(shipment.id, actorUserId, { roll_id: m }))).toBe('ROLL_MISSING_LENGTH');
    expect((await rollState(m)).status).toBe('in_stock');
    await deleteDraft(shipment.id, actorUserId);
  });

  it('accepting receives the توب into the shop immediately; the rest stay pending for a later delivery', async () => {
    const [a, b, c, d] = [await makeFactoryRoll(), await makeFactoryRoll(), await makeFactoryRoll(), await makeFactoryRoll()];
    const { shipmentId, lineIds: [la, lb, lc, ld] } = await draftWith([a, b, c, d]);
    await submit(shipmentId, actorUserId);

    // First delivery: two أتواب arrive.
    expect((await reviewLines(shipmentId, actorUserId, { line_ids: [la, lb], action: 'accept' })).length).toBe(2);
    expect(await rollState(a)).toEqual({ status: 'in_stock', warehouse: 'shop' });
    expect(await rollState(b)).toEqual({ status: 'in_stock', warehouse: 'shop' });
    expect(await rollState(c)).toEqual({ status: 'in_transit', warehouse: 'factory' });
    let shipment = await db('shipments').where({ id: shipmentId }).first('status');
    expect(shipment.status).toBe('pending_approval');

    // «قبول الكل» on decided lines does nothing; single decided line keeps its code.
    expect(await code(reviewLines(shipmentId, actorUserId, { line_ids: [la, lb], action: 'accept' })))
      .toBe('NOTHING_TO_REVIEW');
    expect(await code(reviewLine(shipmentId, la, actorUserId, 'reject'))).toBe('LINE_ALREADY_REVIEWED');
    expect(await code(acceptShipment(shipmentId, actorUserId, {}))).toBe('REVIEW_INCOMPLETE');

    // Undo an untouched accept: back to «قيد الشحن» in the factory.
    const reset = await reviewLines(shipmentId, actorUserId, { line_ids: [lb], action: 'reset' });
    expect(reset[0].status).toBe('pending');
    expect(await rollState(b)).toEqual({ status: 'in_transit', warehouse: 'factory' });

    // Undo is refused once the توب was touched after the decision.
    await db('rolls').where({ id: a }).update({ status: 'sold' });
    expect(await code(reviewLines(shipmentId, actorUserId, { line_ids: [la], action: 'reset' })))
      .toBe('LINE_UNDO_NOT_ALLOWED');
    await db('rolls').where({ id: a }).update({ status: 'in_stock' });

    // Reject goes back to the factory right away and can be sent again
    // even while this طلبية is still open.
    await reviewLines(shipmentId, actorUserId, { line_ids: [lc], action: 'reject', reject_reason_ar: '  ' });
    const rejectedC = await db('shipment_lines').where({ id: lc }).first();
    expect(rejectedC.status).toBe('rejected');
    expect(rejectedC.reject_reason_ar).toBeNull();
    expect(await rollState(c)).toEqual({ status: 'in_stock', warehouse: 'factory' });
    const again = await draftWith([c]);
    expect((await rollState(c)).status).toBe('in_transit');
    await deleteDraft(again.shipmentId, actorUserId);

    // Second delivery: the last pending أتواب arrive — the طلبية closes itself.
    await reviewLines(shipmentId, actorUserId, { line_ids: [lb, ld], action: 'accept' });
    shipment = await db('shipments').where({ id: shipmentId }).first('status');
    expect(shipment.status).toBe('partial_approved');
    expect(await rollState(d)).toEqual({ status: 'in_stock', warehouse: 'shop' });

    // Closed: nothing can be re-run or undone.
    expect(await code(acceptShipment(shipmentId, actorUserId, {}))).toBe('SHIPMENT_NOT_REVIEWABLE');
    expect(await code(reviewLines(shipmentId, actorUserId, { line_ids: [la], action: 'reset' })))
      .toBe('SHIPMENT_NOT_REVIEWABLE');

    // a, b (accepted twice — once undone), d → 4 shipment_in, 1 reversal.
    const moves = await db('stock_movements')
      .where({ reference_type: 'shipment', reference_id: shipmentId })
      .select('event_type');
    expect(moves.filter((m) => m.event_type === 'shipment_in').length).toBe(4);
    expect(moves.filter((m) => m.event_type === 'shipment_reject_back').length).toBe(1);
  });

  it('a metre توب that lost its length cannot be accepted', async () => {
    const m = await makeFactoryRoll('meter');
    const { shipmentId, lineIds: [lm] } = await draftWith([m]);
    await submit(shipmentId, actorUserId);
    await db('rolls').where({ id: m }).update({ length_m: null });
    expect(await code(reviewLines(shipmentId, actorUserId, { line_ids: [lm], action: 'accept' })))
      .toBe('METER_ROLL_MISSING_LENGTH');
    expect(await rollState(m)).toEqual({ status: 'in_transit', warehouse: 'factory' });
    await db('rolls').where({ id: m }).update({ length_m: 50 });
    await reviewLines(shipmentId, actorUserId, { line_ids: [lm], action: 'accept' });
    expect((await db('shipments').where({ id: shipmentId }).first('status')).status).toBe('approved');
  });

  it('bulk review refuses lines from another طلبية', async () => {
    const [a, b] = [await makeFactoryRoll(), await makeFactoryRoll()];
    const s1 = await draftWith([a]);
    const s2 = await draftWith([b]);
    await submit(s1.shipmentId, actorUserId);
    expect(await code(reviewLines(s1.shipmentId, actorUserId, {
      line_ids: [s1.lineIds[0], s2.lineIds[0]], action: 'accept',
    }))).toBe('LINE_NOT_FOUND');

    await reviewLines(s1.shipmentId, actorUserId, { line_ids: s1.lineIds, action: 'reject' });
    expect((await db('shipments').where({ id: s1.shipmentId }).first('status')).status).toBe('rejected');
    expect(await rollState(a)).toEqual({ status: 'in_stock', warehouse: 'factory' });
    await deleteDraft(s2.shipmentId, actorUserId);
  });

  it('exact scenario: 5 أتواب «جاري الشحن» → accept Top 1 → Top 2 → Tops 3-5 later → fully received', async () => {
    const { fabricId, colorId, rollIds: [t1, t2, t3, t4, t5] } = await makeFactoryRolls(5);
    expect(await stock(fabricId, colorId)).toEqual({ available: 5, inTransit: 0 }); // factory stock, not on a طلبية yet

    // Create the طلبية: all 5 show as «جاري الشحن», available stock does NOT grow.
    const { shipmentId, lineIds: [l1, l2, l3, l4, l5] } = await draftWith([t1, t2, t3, t4, t5]);
    for (const t of [t1, t2, t3, t4, t5]) expect(await rollState(t)).toEqual({ status: 'in_transit', warehouse: 'factory' });
    expect(await stock(fabricId, colorId)).toEqual({ available: 0, inTransit: 5 });
    expect(await stock(fabricId, colorId, 'shop')).toEqual({ available: 0, inTransit: 5 });
    expect(await stock(fabricId, colorId, 'factory')).toEqual({ available: 0, inTransit: 5 });
    expect(await stock(fabricId, colorId, 'damaged_shop')).toEqual({ available: 0, inTransit: 0 });

    // Still linked to the طلبية on the Inventory roll list.
    const shipmentNo = (await db('shipments').where({ id: shipmentId }).first('shipment_no')).shipment_no;
    const listed = await listRolls({ fabric_id: fabricId, color_id: colorId });
    expect(listed.every((r) => r.in_transit_shipment_no === shipmentNo)).toBe(true);
    expect(listed.every((r) => Number(r.in_transit_shipment_id) === shipmentId)).toBe(true);

    await submit(shipmentId, actorUserId);
    expect(await stock(fabricId, colorId)).toEqual({ available: 0, inTransit: 5 });
    expect(await shipmentMoves(shipmentId, 'shipment_out')).toBe(5);
    expect(await shipmentMoves(shipmentId, 'shipment_in')).toBe(0);

    // «قبول» on Top 1 alone: it alone moves to مخزن المحل, with exactly one movement.
    await reviewLine(shipmentId, l1, actorUserId, 'accept');
    expect(await rollState(t1)).toEqual({ status: 'in_stock', warehouse: 'shop' });
    for (const t of [t2, t3, t4, t5]) expect(await rollState(t)).toEqual({ status: 'in_transit', warehouse: 'factory' });
    expect(await shipmentMoves(shipmentId, 'shipment_in')).toBe(1);
    expect(await stock(fabricId, colorId, 'shop')).toEqual({ available: 1, inTransit: 4 });

    // Then Top 2 (same vehicle, accepted a moment later).
    await reviewLines(shipmentId, actorUserId, { line_ids: [l2], action: 'accept' });
    expect(await rollState(t1)).toEqual({ status: 'in_stock', warehouse: 'shop' });
    expect(await rollState(t2)).toEqual({ status: 'in_stock', warehouse: 'shop' });
    expect(await rollState(t3)).toEqual({ status: 'in_transit', warehouse: 'factory' });
    expect(await rollState(t4)).toEqual({ status: 'in_transit', warehouse: 'factory' });
    expect(await rollState(t5)).toEqual({ status: 'in_transit', warehouse: 'factory' });
    expect(await stock(fabricId, colorId, 'shop')).toEqual({ available: 2, inTransit: 3 });
    expect(await stock(fabricId, colorId, 'factory')).toEqual({ available: 0, inTransit: 3 });
    for (const t of [t1, t2]) {
      expect(await db('stock_movements').where({ roll_id: t, event_type: 'shipment_in', reference_type: 'shipment', reference_id: shipmentId })).toHaveLength(1);
    }
    expect((await db('shipments').where({ id: shipmentId }).first('status')).status).toBe('pending_approval');
    const reviewAudit = await db('audit_log').where({ action: 'review_shipment_line', entity: 'shipment_line', entity_id: String(l1) });
    expect(reviewAudit).toHaveLength(1);
    expect(reviewAudit[0].after_json).toMatchObject({ status: 'accepted', roll_warehouse: 'shop', roll_status: 'in_stock' });
    const afterFirst = await listRolls({ fabric_id: fabricId, color_id: colorId });
    expect(afterFirst.find((r) => Number(r.id) === t1)?.in_transit_shipment_no).toBeNull();
    expect(afterFirst.find((r) => Number(r.id) === t3)?.in_transit_shipment_no).toBe(shipmentNo);

    // Duplicate acceptance: refused, no extra movement.
    expect(await code(reviewLine(shipmentId, l1, actorUserId, 'accept'))).toBe('LINE_ALREADY_REVIEWED');
    expect(await code(reviewLines(shipmentId, actorUserId, { line_ids: [l1, l2], action: 'accept' }))).toBe('NOTHING_TO_REVIEW');
    expect(await shipmentMoves(shipmentId, 'shipment_in')).toBe(2);

    // Second vehicle: Top 3, 4, 5 — same طلبية, now fully received.
    await reviewLines(shipmentId, actorUserId, { line_ids: [l3, l4, l5], action: 'accept' });
    for (const t of [t1, t2, t3, t4, t5]) expect(await rollState(t)).toEqual({ status: 'in_stock', warehouse: 'shop' });
    expect(await stock(fabricId, colorId, 'shop')).toEqual({ available: 5, inTransit: 0 });
    expect((await db('shipments').where({ id: shipmentId }).first('status')).status).toBe('approved');

    // Exactly one out + one in per توب; every receipt keeps the طلبية reference.
    expect(await shipmentMoves(shipmentId, 'shipment_out')).toBe(5);
    expect(await shipmentMoves(shipmentId, 'shipment_in')).toBe(5);
    const ins = await db('stock_movements').whereIn('roll_id', [t1, t2, t3, t4, t5]).where({ event_type: 'shipment_in' });
    expect(ins.length).toBe(5);
    expect(ins.every((m) => m.reference_type === 'shipment' && Number(m.reference_id) === shipmentId)).toBe(true);
  });

  it('a rejected توب leaves «جاري الشحن» without creating any new inventory row', async () => {
    const { fabricId, colorId, rollIds: [a, b] } = await makeFactoryRolls(2);
    const rollCount = async () => Number((await db('rolls').where({ fabric_id: fabricId }).count('* as n').first())!.n);
    const rowsBefore = await rollCount();
    const { shipmentId, lineIds: [la, lb] } = await draftWith([a, b]);
    await submit(shipmentId, actorUserId);
    expect(await stock(fabricId, colorId)).toEqual({ available: 0, inTransit: 2 });

    await reviewLines(shipmentId, actorUserId, { line_ids: [la], action: 'reject', reject_reason_ar: 'عيب' });
    expect(await rollState(a)).toEqual({ status: 'in_stock', warehouse: 'factory' });
    expect(await stock(fabricId, colorId)).toEqual({ available: 1, inTransit: 1 });
    expect(await stock(fabricId, colorId, 'shop')).toEqual({ available: 0, inTransit: 1 });
    expect(await shipmentMoves(shipmentId, 'shipment_reject_back')).toBe(1);
    expect(await shipmentMoves(shipmentId, 'shipment_in')).toBe(0);
    expect(await rollCount()).toBe(rowsBefore);

    await reviewLines(shipmentId, actorUserId, { line_ids: [lb], action: 'accept' });
    expect((await db('shipments').where({ id: shipmentId }).first('status')).status).toBe('partial_approved');
    expect(await rollCount()).toBe(rowsBefore);
  });

  it('only a توب still «جاري الشحن» can be received or rejected — nothing is written otherwise', async () => {
    const { rollIds: [a] } = await makeFactoryRolls(1);
    const { shipmentId, lineIds: [la] } = await draftWith([a]);
    await submit(shipmentId, actorUserId);
    await db('rolls').where({ id: a }).update({ status: 'in_stock' }); // the legacy inconsistency migration 103 repairs

    expect(await code(reviewLines(shipmentId, actorUserId, { line_ids: [la], action: 'accept' }))).toBe('ROLL_NOT_IN_TRANSIT');
    expect(await code(reviewLines(shipmentId, actorUserId, { line_ids: [la], action: 'reject' }))).toBe('ROLL_NOT_IN_TRANSIT');
    expect((await db('shipment_lines').where({ id: la }).first('status')).status).toBe('pending');
    expect(await shipmentMoves(shipmentId, 'shipment_in')).toBe(0);
    expect(await shipmentMoves(shipmentId, 'shipment_reject_back')).toBe(0);
    expect(await rollState(a)).toEqual({ status: 'in_stock', warehouse: 'factory' });

    await db('rolls').where({ id: a }).update({ status: 'in_transit' });
    await reviewLines(shipmentId, actorUserId, { line_ids: [la], action: 'accept' });
    expect(await rollState(a)).toEqual({ status: 'in_stock', warehouse: 'shop' });
  });

  it('a line decided under the old «تأكيد الاستلام» flow is reopened by migration 103, then received exactly once', async () => {
    const { rollIds: [a, b] } = await makeFactoryRolls(2);
    const { shipmentId, lineIds: [la, lb] } = await draftWith([a, b]);
    await submit(shipmentId, actorUserId);
    // Old flow: «قبول» only flagged the line (stock moved on «تأكيد الاستلام»);
    // a pre-100 server also left the توب in_stock.
    await db('shipment_lines').where({ id: la }).update({ status: 'accepted' });
    await db('shipment_lines').where({ id: lb }).update({ status: 'rejected', reject_reason_ar: 'قديم' });
    await db('rolls').where({ id: b }).update({ status: 'in_stock' });

    // Stuck: can be neither received nor undone.
    expect(await code(reviewLine(shipmentId, la, actorUserId, 'accept'))).toBe('LINE_ALREADY_REVIEWED');
    expect(await code(reviewLines(shipmentId, actorUserId, { line_ids: [la], action: 'reset' }))).toBe('LINE_UNDO_NOT_ALLOWED');

    await repairLegacyTransit(db);
    expect((await db('shipment_lines').where({ id: la }).first('status')).status).toBe('pending');
    expect((await db('shipment_lines').where({ id: lb }).first('status')).status).toBe('pending');
    expect(await rollState(a)).toEqual({ status: 'in_transit', warehouse: 'factory' });
    expect(await rollState(b)).toEqual({ status: 'in_transit', warehouse: 'factory' });
    const audited = await db('audit_log').where({ action: 'backfill_reopen_shipment_line', entity: 'shipment_line' }).whereIn('entity_id', [String(la), String(lb)]);
    expect(audited.length).toBe(2);
    expect(await shipmentMoves(shipmentId, 'shipment_in')).toBe(0);
    expect(await shipmentMoves(shipmentId, 'shipment_reject_back')).toBe(0);

    // The repair is idempotent.
    await repairLegacyTransit(db);
    expect(await db('audit_log').where({ action: 'backfill_reopen_shipment_line' }).whereIn('entity_id', [String(la), String(lb)])).toHaveLength(2);

    await reviewLines(shipmentId, actorUserId, { line_ids: [la], action: 'accept' });
    expect(await rollState(a)).toEqual({ status: 'in_stock', warehouse: 'shop' });
    expect(await rollState(b)).toEqual({ status: 'in_transit', warehouse: 'factory' });
    await reviewLines(shipmentId, actorUserId, { line_ids: [lb], action: 'accept' });
    expect(await rollState(b)).toEqual({ status: 'in_stock', warehouse: 'shop' });
    expect(await shipmentMoves(shipmentId, 'shipment_in')).toBe(2);
    expect((await db('shipments').where({ id: shipmentId }).first('status')).status).toBe('approved');
  });

  it('a توب «جاري الشحن» cannot be sold', async () => {
    const { rollIds: [a] } = await makeFactoryRolls(1);
    const { shipmentId } = await draftWith([a]);
    const serial = String(Date.now()).slice(-6) + String(sequence).padStart(2, '0');
    const customer = await createCustomerRecord(actorUserId, { name_ar: `عميل شحن ${stamp()}`, phone: `011${serial}` });
    const sale = createSale(
      actorUserId,
      {
        customerId: Number(customer.id),
        fulfillmentDestination: 'factory_direct',
        lines: [{ rollId: a, finalPricePerUnit: 100 }],
        payments: [{ method: 'cash', amount: 1000 }],
      },
      null,
    );
    expect(await code(sale)).toBe('ROLL_NOT_AVAILABLE');
    expect(await rollState(a)).toEqual({ status: 'in_transit', warehouse: 'factory' });
    await deleteDraft(shipmentId, actorUserId);
  });

  it('an inventory count (جرد) does not expect a توب «جاري الشحن» on the shelf', async () => {
    const { rollIds: [a] } = await makeFactoryRolls(1);
    const { shipmentId } = await draftWith([a]);
    let stocktakeId: number;
    try {
      stocktakeId = Number((await startStocktake(actorUserId, 'roll_level', 'factory')).id);
    } catch (e) {
      // A real factory count is open / awaiting resolution on this DB: leave it alone.
      if (e instanceof StocktakeBlockedError) {
        await deleteDraft(shipmentId, actorUserId);
        return;
      }
      throw e;
    }
    const detail = await getStocktake(stocktakeId);
    expect(detail!.lines.some((l) => Number(l.roll_id) === a)).toBe(false);
    await cancelStocktake(stocktakeId, actorUserId);
    await deleteDraft(shipmentId, actorUserId);
  });
});
