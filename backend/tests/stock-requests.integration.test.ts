// طلبات الأتواب — the full shop -> factory request workflow against the real
// database: reservation, scanning, partial dispatch across several shipments,
// the EXISTING review/receive logic, replacements, history, audit, legacy
// shipments and the request status after every accept / reject / undo.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/connection.js';
import { createFabric } from '../src/domain/items/fabrics.service.js';
import { createColor } from '../src/domain/items/colors.service.js';
import { createTopBatch, splitTop } from '../src/domain/items/tops.service.js';
import {
  addRoll,
  createDraft,
  deleteDraft,
  getShipment,
  listFactoryRolls,
  listShipments,
  removeLine,
  reviewLines,
  submit,
} from '../src/domain/inventory/shipments.service.js';
import {
  addItems,
  cancelItem,
  cancelRequest,
  createRequest,
  getRequest,
  getSummary,
  listAvailableRolls,
  listRequests,
  markUnavailable,
  openDraftShipment,
} from '../src/domain/stockRequests/stockRequests.service.js';

const RUN_DB = process.env.RUN_DB_TESTS === '1';
let actor: number;
let seq = 0;

const stamp = () => `${Date.now()}-${++seq}`;

type TestRoll = { id: number; barcode: string };

/** n kg أتواب of one new fabric/colour in the factory. */
async function makeRolls(n: number): Promise<TestRoll[]> {
  const id = stamp();
  const fabric = await createFabric({ name_ar: `قماش طلبات ${id}`, width_cm: 150, grade: 'A', unit: 'kg' });
  const color = await createColor({ name_ar: `لون طلبات ${id}` });
  const batch = await createTopBatch(
    {
      fabric: { id: Number(fabric.id) },
      rolls: Array.from({ length: n }, () => ({ color: { id: Number(color.id) }, weight_kg: 10, width_cm: 150 })),
    },
    actor,
  );
  const ids = batch.rolls.map((r) => Number(r.id));
  await db('rolls').whereIn('id', ids).update({ warehouse: 'factory', status: 'in_stock' });
  const rows = await db('rolls').whereIn('id', ids).orderBy('id').select('id', 'internal_barcode');
  return rows.map((r) => ({ id: Number(r.id), barcode: r.internal_barcode as string }));
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as Error & { code?: string }).code ?? (e as Error).message;
  }
}

async function rollState(id: number) {
  const r = await db('rolls').where({ id }).first('status', 'warehouse');
  return { status: r.status as string, warehouse: r.warehouse as string };
}

async function moves(rollId: number): Promise<string[]> {
  const rows = await db('stock_movements').where({ roll_id: rollId }).orderBy('id').select('event_type');
  return rows.map((r) => r.event_type as string);
}

async function itemOf(requestId: number, rollId: number, status?: string) {
  const q = db('stock_request_items').where({ request_id: requestId, roll_id: rollId }).orderBy('id', 'desc');
  if (status) q.where({ status });
  return q.first();
}

async function lineId(shipmentId: number, rollId: number): Promise<number> {
  return Number((await db('shipment_lines').where({ shipment_id: shipmentId, roll_id: rollId }).first('id')).id);
}

async function auditCount(action: string, entityId?: number): Promise<number> {
  const q = db('audit_log').where({ action });
  if (entityId !== undefined) q.where({ entity_id: String(entityId) });
  return (await q).length;
}

/** The status stored on the request must always equal its SQL definition. */
async function expectStatusConsistent(requestId: number): Promise<string> {
  const stored = (await db('stock_requests').where({ id: requestId }).first('status')).status as string;
  const derived = (await db.raw('SELECT stock_request_derived_status(?) AS s', [requestId])).rows[0].s as string;
  expect(stored).toBe(derived);
  return stored;
}

async function scan(shipmentId: number, rolls: TestRoll[]) {
  for (const r of rolls) await addRoll(shipmentId, actor, { internal_barcode: r.barcode });
}

describe.skipIf(!RUN_DB).sequential('stock requests — workflow', () => {
  beforeAll(async () => {
    const a = await db('users').whereIn('role', ['owner', 'super_admin']).orderBy('id').first('id');
    if (!a) throw new Error('TEST_ACTOR_NOT_FOUND');
    actor = Number(a.id);
  });

  afterAll(async () => {
    if (RUN_DB) await db.destroy();
  });

  // -------------------------------------------------------------------------
  it('ACCEPTANCE: 10 requested -> 6 scanned (extra blocked) -> 4 accepted / 2 rejected -> more shipments -> replacements; full history', async () => {
    const rolls = await makeRolls(12);
    const requested = rolls.slice(0, 10);
    const extra = rolls.slice(10);

    // ---- the shop requests 10 specific tops
    const created = await createRequest(actor, { roll_ids: requested.map((r) => r.id), notes_ar: 'اختبار القبول' });
    const reqId = Number(created!.id);
    expect(created!.status).toBe('open');
    expect(created!.counts).toMatchObject({ total: 10, requested: 10, packing: 0, dispatched: 0 });
    // reserved, but NOT moved: still plain factory stock, no stock movement at all
    for (const r of requested) {
      expect(await rollState(r.id)).toEqual({ status: 'in_stock', warehouse: 'factory' });
      expect(await moves(r.id)).not.toContain('shipment_out');
    }
    // the factory is told
    const created_notif = await db('notifications').where({ event_type: 'stock_request_created', recipient_role: 'factory_sender' })
      .whereRaw(`payload_jsonb->>'request_id' = ?`, [String(reqId)]);
    expect(created_notif.length).toBe(1);

    // ---- first linked shipment: scan 6, an unrequested top is rejected by the scanner
    const d1 = await openDraftShipment(reqId, actor);
    expect(Number(d1.stock_request_id)).toBe(reqId);
    expect(Number((await openDraftShipment(reqId, actor)).id)).toBe(Number(d1.id)); // idempotent: same draft

    expect(await code(addRoll(Number(d1.id), actor, { internal_barcode: extra[0].barcode }))).toBe('ROLL_NOT_IN_REQUEST');
    expect(await rollState(extra[0].id)).toEqual({ status: 'in_stock', warehouse: 'factory' }); // untouched

    await scan(Number(d1.id), requested.slice(0, 6));
    expect(await code(addRoll(Number(d1.id), actor, { internal_barcode: requested[0].barcode }))).toBe('ROLL_ALREADY_SCANNED');
    for (const r of requested.slice(0, 6)) {
      expect(await rollState(r.id)).toEqual({ status: 'in_transit', warehouse: 'factory' });
      expect((await itemOf(reqId, r.id))!.status).toBe('packing');
    }
    let detail = (await getRequest(reqId))!;
    expect(detail.counts).toMatchObject({ packing: 6, requested: 4 });
    expect(await expectStatusConsistent(reqId)).toBe('open');

    // ---- dispatch the 6: unscanned items stay requested for the next shipment
    const shipped = await submit(Number(d1.id), actor);
    expect(shipped.status).toBe('pending_approval');
    for (const r of requested.slice(0, 6)) {
      expect((await itemOf(reqId, r.id))!.status).toBe('dispatched');
      expect(await moves(r.id)).toEqual(['factory_in', 'shipment_out']);
    }
    expect(await expectStatusConsistent(reqId)).toBe('in_progress'); // 4 still to ship
    const arrived = await db('notifications').where({ event_type: 'shipment_arrived', recipient_role: 'shop_seller' })
      .whereRaw(`payload_jsonb->>'shipment_id' = ?`, [String(d1.id)]);
    expect(arrived.length).toBe(1);
    expect(arrived[0].body_ar).toContain(created!.request_no);

    // ---- the shop reviews with the EXISTING workflow: accept 4, reject 2
    const lines1 = await Promise.all(requested.slice(0, 6).map((r) => lineId(Number(d1.id), r.id)));
    await reviewLines(Number(d1.id), actor, { line_ids: lines1.slice(0, 4), action: 'accept' });
    await reviewLines(Number(d1.id), actor, { line_ids: lines1.slice(4), action: 'reject', reject_reason_ar: 'عيب في النسيج' });
    for (const r of requested.slice(0, 4)) {
      expect(await rollState(r.id)).toEqual({ status: 'in_stock', warehouse: 'shop' });
      expect(await moves(r.id)).toEqual(['factory_in', 'shipment_out', 'shipment_in']);
    }
    for (const r of requested.slice(4, 6)) {
      expect(await rollState(r.id)).toEqual({ status: 'in_stock', warehouse: 'factory' });
      expect(await moves(r.id)).toEqual(['factory_in', 'shipment_out', 'shipment_reject_back']);
    }
    expect((await getShipment(Number(d1.id)))!.status).toBe('partial_approved');
    detail = (await getRequest(reqId))!;
    expect(detail.counts).toMatchObject({ accepted: 4, rejected: 2, awaiting_review: 0, requested: 4 });
    expect(await expectStatusConsistent(reqId)).toBe('in_progress');

    // ---- second linked shipment: one item is unavailable, the factory sends the rest
    const itemR9 = await itemOf(reqId, requested[9].id);
    expect(await code(markUnavailable(reqId, Number(itemR9!.id), actor, '  '))).toBe('REASON_REQUIRED');
    await markUnavailable(reqId, Number(itemR9!.id), actor, 'لم يتم العثور عليه في المخزن');
    const unavailNotif = await db('notifications').where({ event_type: 'stock_request_item_unavailable', recipient_role: 'shop_seller' })
      .whereRaw(`payload_jsonb->>'item_id' = ?`, [String(itemR9!.id)]);
    expect(unavailNotif.length).toBe(1);

    const d2 = await openDraftShipment(reqId, actor);
    expect(Number(d2.id)).not.toBe(Number(d1.id)); // a NEW shipment of the same request
    await scan(Number(d2.id), requested.slice(6, 9));
    await submit(Number(d2.id), actor);
    // nothing left to ship, but the shop has not reviewed yet => NOT completed
    expect(await expectStatusConsistent(reqId)).toBe('awaiting_review');
    expect((await getRequest(reqId))!.counts.awaiting_review).toBe(3);

    const lines2 = await Promise.all(requested.slice(6, 9).map((r) => lineId(Number(d2.id), r.id)));
    await reviewLines(Number(d2.id), actor, { line_ids: lines2.slice(0, 2), action: 'accept' });
    expect(await expectStatusConsistent(reqId)).toBe('awaiting_review'); // one line still undecided
    expect((await getRequest(reqId))!.counts).toMatchObject({ accepted: 6, awaiting_review: 1 });

    // undo one acceptance while the shipment is still open: it goes back to waiting for review
    await reviewLines(Number(d2.id), actor, { line_ids: [lines2[0]], action: 'reset' });
    expect(await expectStatusConsistent(reqId)).toBe('awaiting_review');
    expect((await getRequest(reqId))!.counts).toMatchObject({ accepted: 5, awaiting_review: 2 });
    expect(await rollState(requested[6].id)).toEqual({ status: 'in_transit', warehouse: 'factory' });

    await reviewLines(Number(d2.id), actor, { line_ids: [lines2[0], lines2[2]], action: 'accept' });
    expect(await expectStatusConsistent(reqId)).toBe('completed'); // everything reviewed

    // ---- replacements: retry a rejected top, replace the unavailable one with another top
    const rejectedItem4 = await itemOf(reqId, requested[4].id);
    const rejectedItem5 = await itemOf(reqId, requested[5].id);
    const acceptedItem0 = await itemOf(reqId, requested[0].id);
    expect(await code(addItems(reqId, actor, { roll_ids: [extra[0].id], replaces_item_id: Number(acceptedItem0!.id) }))).toBe('ITEM_NOT_REPLACEABLE');
    expect(await code(addItems(reqId, actor, { roll_ids: [extra[0].id, extra[1].id], replaces_item_id: Number(rejectedItem4!.id) }))).toBe('REPLACEMENT_NEEDS_ONE_ROLL');

    await addItems(reqId, actor, { roll_ids: [requested[4].id], replaces_item_id: Number(rejectedItem4!.id) }); // retry the same top
    await addItems(reqId, actor, { roll_ids: [extra[0].id], replaces_item_id: Number(itemR9!.id) }); // a different top
    expect(await code(addItems(reqId, actor, { roll_ids: [extra[1].id], replaces_item_id: Number(rejectedItem4!.id) }))).toBe('REPLACEMENT_ALREADY_EXISTS');
    expect(await expectStatusConsistent(reqId)).toBe('in_progress');

    // ---- third shipment ships both replacements; the shop accepts
    const d3 = await openDraftShipment(reqId, actor);
    await scan(Number(d3.id), [requested[4], extra[0]]);
    await submit(Number(d3.id), actor);
    expect(await expectStatusConsistent(reqId)).toBe('awaiting_review');
    await reviewLines(Number(d3.id), actor, {
      line_ids: [await lineId(Number(d3.id), requested[4].id), await lineId(Number(d3.id), extra[0].id)],
      action: 'accept',
    });
    expect(await expectStatusConsistent(reqId)).toBe('completed');

    // ---- final state: every item kept, with complete history
    detail = (await getRequest(reqId))!;
    expect(detail.counts).toMatchObject({ total: 12, accepted: 9, rejected: 2, unavailable: 1, requested: 0, packing: 0, awaiting_review: 0 });
    expect(detail.shipments.map((s) => s.id)).toEqual([Number(d1.id), Number(d2.id), Number(d3.id)]);

    // the ORIGINAL rejected item #4 is untouched and linked to its replacement
    const orig4 = detail.items.find((i) => Number(i.id) === Number(rejectedItem4!.id))!;
    const retry4 = detail.items.find((i) => i.replaces_item_id === Number(rejectedItem4!.id))!;
    expect(orig4.outcome).toBe('rejected');
    expect(orig4.reject_reason_ar).toBe('عيب في النسيج');
    expect(orig4.replaced_by_item_id).toBe(Number(retry4.id));
    expect(retry4.outcome).toBe('accepted');
    expect(orig4.events.map((e) => e.event_type)).toEqual(['requested', 'packed', 'dispatched', 'line_rejected', 'replaced_by']);
    expect(retry4.events.map((e) => e.event_type)).toEqual(['replacement_requested', 'packed', 'dispatched', 'line_accepted']);
    // the rejected-and-not-replaced item #5 still offers a replacement; accepted ones do not
    expect(detail.items.find((i) => Number(i.id) === Number(rejectedItem5!.id))!.can_replace).toBe(true);
    expect(orig4.can_replace).toBe(false);
    // the unavailable one keeps its reason
    const origU = detail.items.find((i) => Number(i.id) === Number(itemR9!.id))!;
    expect(origU.outcome).toBe('unavailable');
    expect(origU.unavailable_reason_ar).toBe('لم يتم العثور عليه في المخزن');
    expect(origU.events.map((e) => e.event_type)).toEqual(['requested', 'unavailable', 'replaced_by']);

    // inventory ledger of the retried top: out, back, out, in — and it ends in the shop
    expect(await moves(requested[4].id)).toEqual(['factory_in', 'shipment_out', 'shipment_reject_back', 'shipment_out', 'shipment_in']);
    expect(await rollState(requested[4].id)).toEqual({ status: 'in_stock', warehouse: 'shop' });
    // top #5 stays rejected at the factory, #9 never moved
    expect(await rollState(requested[5].id)).toEqual({ status: 'in_stock', warehouse: 'factory' });
    expect(await moves(requested[9].id)).toEqual(['factory_in']);
    expect(await rollState(extra[1].id)).toEqual({ status: 'in_stock', warehouse: 'factory' }); // never requested, never touched
    // no active reservation is left behind
    const active = await db('stock_request_items').where({ request_id: reqId }).whereIn('status', ['requested', 'packing']);
    expect(active.length).toBe(0);

    // audit trail
    expect(await auditCount('create_stock_request', reqId)).toBe(1);
    expect(await auditCount('mark_request_item_unavailable', Number(itemR9!.id))).toBe(1);
    expect(await auditCount('request_item_replacement', reqId)).toBe(2);
    expect(await auditCount('dispatch_request_items', reqId)).toBe(3);
    expect(await auditCount('pack_request_item', Number((await itemOf(reqId, requested[0].id))!.id))).toBe(1);
    expect(await auditCount('review_shipment_line', lines1[0])).toBe(1);

    // the shop's list and the factory's counters see it
    const list = await listRequests({ limit: 200, mine: true }, actor);
    expect(list.find((r) => Number(r.id) === reqId)).toMatchObject({ status: 'completed', total: 12, accepted: 9, rejected: 2, unavailable: 1 });
    expect((await getSummary()).to_prepare).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------------------
  it('a rejection cannot be undone once the top is requested again; it can after that request is withdrawn', async () => {
    const rolls = await makeRolls(2);
    const reqId = Number((await createRequest(actor, { roll_ids: rolls.map((r) => r.id) }))!.id);
    const d = await openDraftShipment(reqId, actor);
    await scan(Number(d.id), rolls);
    await submit(Number(d.id), actor);
    const [lineA, lineB] = await Promise.all(rolls.map((r) => lineId(Number(d.id), r.id)));

    await reviewLines(Number(d.id), actor, { line_ids: [lineA], action: 'reject', reject_reason_ar: 'خطأ' }); // B stays pending => shipment open
    expect((await getShipment(Number(d.id)))!.status).toBe('pending_approval');
    expect(await rollState(rolls[0].id)).toEqual({ status: 'in_stock', warehouse: 'factory' });

    // the shop asks for the same top again
    const rejectedItem = await itemOf(reqId, rolls[0].id);
    await addItems(reqId, actor, { roll_ids: [rolls[0].id], replaces_item_id: Number(rejectedItem!.id) });

    // un-rejecting would put one top in two places: refused, nothing changed
    expect(await code(reviewLines(Number(d.id), actor, { line_ids: [lineA], action: 'reset' }))).toBe('LINE_UNDO_NOT_ALLOWED');
    expect(await rollState(rolls[0].id)).toEqual({ status: 'in_stock', warehouse: 'factory' });
    expect((await db('shipment_lines').where({ id: lineA }).first()).status).toBe('rejected');

    // once the new request item is withdrawn, the undo is allowed again
    await cancelItem(reqId, Number((await itemOf(reqId, rolls[0].id, 'requested'))!.id), actor, 'غيرنا رأينا');
    await reviewLines(Number(d.id), actor, { line_ids: [lineA], action: 'reset' });
    expect(await rollState(rolls[0].id)).toEqual({ status: 'in_transit', warehouse: 'factory' });
    expect(await expectStatusConsistent(reqId)).toBe('awaiting_review');
    await reviewLines(Number(d.id), actor, { line_ids: [lineA, lineB], action: 'accept' });
    expect(await expectStatusConsistent(reqId)).toBe('completed');
  });

  // -------------------------------------------------------------------------
  it('LEGACY: manual shipments still work end to end and are not linked to any request', async () => {
    const [a, b, c] = await makeRolls(3);
    const reqId = Number((await createRequest(actor, { roll_ids: [c.id] }))!.id);

    const manual = await createDraft(actor, {});
    expect(manual.stock_request_id ?? null).toBeNull();
    await addRoll(Number(manual.id), actor, { internal_barcode: a.barcode });
    await addRoll(Number(manual.id), actor, { roll_id: b.id });
    // a top reserved by a request cannot slip into a manual shipment
    expect(await code(addRoll(Number(manual.id), actor, { roll_id: c.id }))).toBe('ROLL_RESERVED_FOR_REQUEST');
    await submit(Number(manual.id), actor);
    const lines = await Promise.all([a, b].map((r) => lineId(Number(manual.id), r.id)));
    await reviewLines(Number(manual.id), actor, { line_ids: lines, action: 'accept' });

    const shipment = (await getShipment(Number(manual.id)))!;
    expect(shipment.status).toBe('approved');
    expect(shipment.stock_request_id ?? null).toBeNull();
    expect(shipment.request_no ?? null).toBeNull();
    expect(await rollState(a.id)).toEqual({ status: 'in_stock', warehouse: 'shop' });
    expect(await moves(a.id)).toEqual(['factory_in', 'shipment_out', 'shipment_in']);
    // the manual submit notification is unchanged (no request wording)
    const n = await db('notifications').where({ event_type: 'shipment_arrived' }).whereRaw(`payload_jsonb->>'shipment_id' = ?`, [String(manual.id)]);
    expect(n[0].body_ar).not.toContain('للطلب');

    // listing works for both kinds
    const all = await listShipments({});
    expect(all.find((s) => Number(s.id) === Number(manual.id))!.request_no ?? null).toBeNull();

    // nothing of the manual flow touched the request
    expect((await getRequest(reqId))!.counts).toMatchObject({ total: 1, requested: 1 });
  });

  // -------------------------------------------------------------------------
  it('createRequest is all-or-nothing and names the failing barcodes', async () => {
    const [a, b, c] = await makeRolls(3);
    await db('rolls').where({ id: b.id }).update({ warehouse: 'shop' });
    const before = Number((await db('stock_requests').count<{ n: string }[]>({ n: '*' }))[0].n);

    const err = await createRequest(actor, { roll_ids: [a.id, b.id, c.id] }).catch((e) => e as Error & { barcodes?: string[] });
    expect((err as Error).message).toBe('ROLL_NOT_IN_FACTORY');
    expect((err as Error & { barcodes?: string[] }).barcodes).toEqual([b.barcode]);
    expect(Number((await db('stock_requests').count<{ n: string }[]>({ n: '*' }))[0].n)).toBe(before);
    expect(await db('stock_request_items').whereIn('roll_id', [a.id, c.id])).toHaveLength(0); // nothing reserved

    // a second request cannot take a reserved top
    await createRequest(actor, { roll_ids: [a.id] });
    const dup = await createRequest(actor, { roll_ids: [a.id, c.id] }).catch((e) => e as Error & { barcodes?: string[] });
    expect((dup as Error).message).toBe('ROLL_ALREADY_REQUESTED');
    expect((dup as Error & { barcodes?: string[] }).barcodes).toEqual([a.barcode]);
    expect(await db('stock_request_items').where({ roll_id: c.id })).toHaveLength(0);

    // a top already on a manual draft is «قيد الشحن» and cannot be requested
    const manual = await createDraft(actor, {});
    await addRoll(Number(manual.id), actor, { roll_id: c.id });
    expect(await code(createRequest(actor, { roll_ids: [c.id] }))).toBe('ROLL_NOT_AVAILABLE');
  });

  // -------------------------------------------------------------------------
  it('removing a line or deleting the draft returns the items to «requested»; nothing is lost', async () => {
    const rolls = await makeRolls(3);
    const reqId = Number((await createRequest(actor, { roll_ids: rolls.map((r) => r.id) }))!.id);
    const d = await openDraftShipment(reqId, actor);
    await scan(Number(d.id), rolls);

    const lid = await lineId(Number(d.id), rolls[0].id);
    await removeLine(Number(d.id), lid, actor);
    expect((await itemOf(reqId, rolls[0].id))!.status).toBe('requested');
    expect((await itemOf(reqId, rolls[0].id))!.shipment_id).toBeNull();
    expect(await rollState(rolls[0].id)).toEqual({ status: 'in_stock', warehouse: 'factory' });
    // it may be scanned again
    await addRoll(Number(d.id), actor, { internal_barcode: rolls[0].barcode });

    await deleteDraft(Number(d.id), actor);
    expect(await db('shipments').where({ id: d.id })).toHaveLength(0);
    const detail = (await getRequest(reqId))!;
    expect(detail.counts).toMatchObject({ total: 3, requested: 3, packing: 0 });
    for (const r of rolls) expect(await rollState(r.id)).toEqual({ status: 'in_stock', warehouse: 'factory' });
    const events = detail.items.flatMap((i) => i.events.map((e) => e.event_type));
    expect(events.filter((e) => e === 'unpacked').length).toBe(4); // 1 removed line + 3 on delete (one re-scanned)
    expect(await expectStatusConsistent(reqId)).toBe('open');
  });

  // -------------------------------------------------------------------------
  it('cancel: refused while the factory is packing; afterwards history is kept and nothing more can be added or shipped', async () => {
    const rolls = await makeRolls(3);
    const reqId = Number((await createRequest(actor, { roll_ids: rolls.map((r) => r.id) }))!.id);
    const d = await openDraftShipment(reqId, actor);
    await addRoll(Number(d.id), actor, { internal_barcode: rolls[0].barcode });

    const packedItem = await itemOf(reqId, rolls[0].id);
    expect(await code(cancelItem(reqId, Number(packedItem!.id), actor, null))).toBe('ITEM_BEING_PACKED');
    expect(await code(cancelRequest(reqId, actor, 'لم نعد نحتاجها'))).toBe('REQUEST_HAS_PACKING_ITEMS');
    expect(await code(markUnavailable(reqId, Number(packedItem!.id), actor, 'x1'))).toBe('ITEM_BEING_PACKED');

    // one item withdrawn on its own
    await cancelItem(reqId, Number((await itemOf(reqId, rolls[1].id))!.id), actor, 'لا حاجة');
    expect((await itemOf(reqId, rolls[1].id))!.status).toBe('cancelled');

    await removeLine(Number(d.id), await lineId(Number(d.id), rolls[0].id), actor);
    await cancelRequest(reqId, actor, 'لم نعد نحتاجها');
    const detail = (await getRequest(reqId))!;
    expect(detail.status).toBe('cancelled');
    expect(detail.cancel_reason_ar).toBe('لم نعد نحتاجها');
    expect(detail.counts).toMatchObject({ total: 3, cancelled: 3 }); // every item still there
    expect(await code(addItems(reqId, actor, { roll_ids: [rolls[0].id] }))).toBe('REQUEST_CANCELLED');
    expect(await code(openDraftShipment(reqId, actor))).toBe('REQUEST_CANCELLED');
    expect(await code(cancelRequest(reqId, actor, 'again'))).toBe('REQUEST_CANCELLED');
    expect(await code(markUnavailable(reqId, Number(packedItem!.id), actor, 'x1'))).toBe('ITEM_NOT_REQUESTED');
    // the tops are free for somebody else
    expect(await code(createRequest(actor, { roll_ids: [rolls[0].id] }))).toBe('OK');
    expect(await auditCount('cancel_stock_request', reqId)).toBe(1);
  });

  // -------------------------------------------------------------------------
  it('cancelling the rest of a request does not stop what was already dispatched', async () => {
    const rolls = await makeRolls(4);
    const reqId = Number((await createRequest(actor, { roll_ids: rolls.map((r) => r.id) }))!.id);
    const d = await openDraftShipment(reqId, actor);
    await scan(Number(d.id), rolls.slice(0, 2));
    await submit(Number(d.id), actor);

    await cancelRequest(reqId, actor, 'نكتفي بما تم شحنه');
    const detail = (await getRequest(reqId))!;
    expect(detail.counts).toMatchObject({ dispatched: 2, cancelled: 2 });
    expect(await expectStatusConsistent(reqId)).toBe('awaiting_review');
    // the shipment is still reviewable by the existing workflow
    await reviewLines(Number(d.id), actor, {
      line_ids: await Promise.all(rolls.slice(0, 2).map((r) => lineId(Number(d.id), r.id))),
      action: 'accept',
    });
    expect(await expectStatusConsistent(reqId)).toBe('completed');
    // a cancelled request refuses replacements even though items were rejected/unavailable
    expect(await code(addItems(reqId, actor, { roll_ids: [rolls[2].id] }))).toBe('REQUEST_CANCELLED');
  });

  // -------------------------------------------------------------------------
  it('a reserved top cannot be split, and is hidden from both pickers', async () => {
    const rolls = await makeRolls(2);
    await createRequest(actor, { roll_ids: [rolls[0].id] });

    expect(await code(splitTop(rolls[0].id, 4, actor))).toBe('ROLL_RESERVED_FOR_REQUEST');
    expect(await code(splitTop(rolls[1].id, 4, actor))).toBe('OK'); // an unreserved one still splits

    const manualPicker = await listFactoryRolls({ limit: 500 });
    expect(manualPicker.some((r) => Number(r.id) === rolls[0].id)).toBe(false);
    expect(manualPicker.some((r) => Number(r.id) === rolls[1].id)).toBe(true);
    const shopPicker = await listAvailableRolls({ limit: 500 });
    expect(shopPicker.some((r) => Number(r.id) === rolls[0].id)).toBe(false);
    expect(shopPicker.some((r) => Number(r.id) === rolls[1].id)).toBe(true);
  });

  // -------------------------------------------------------------------------
  it('a metre top without a length cannot be requested (the factory could never ship it)', async () => {
    const id = stamp();
    const fabric = await createFabric({ name_ar: `قماش متر ${id}`, width_cm: 150, grade: 'A', unit: 'meter' });
    const color = await createColor({ name_ar: `لون متر ${id}` });
    const batch = await createTopBatch(
      { fabric: { id: Number(fabric.id) }, rolls: [{ color: { id: Number(color.id) }, weight_kg: 10, length_m: 50, width_cm: 150 }] },
      actor,
    );
    const rollId = Number(batch.rolls[0].id);
    await db('rolls').where({ id: rollId }).update({ warehouse: 'factory', status: 'in_stock', length_m: null });
    expect(await code(createRequest(actor, { roll_ids: [rollId] }))).toBe('ROLL_MISSING_LENGTH');
    expect((await listAvailableRolls({ limit: 500 })).some((r) => Number(r.id) === rollId)).toBe(false);
  });
});
