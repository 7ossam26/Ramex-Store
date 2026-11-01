// طلبات الأتواب — concurrency between reservations and every other thing that can
// happen to a top: factory-direct sales, adjustments / damage, scanning onto a
// shipment, marking unavailable, cancelling. Each race is repeated many times and
// the invariants are checked after EVERY round:
//   1. a top is never both "taken" by an operation and still reserved / packing;
//   2. a top is never in two places (sold AND in a shipment);
//   3. the stored request status always equals its SQL definition;
//   4. nothing deadlocks (Postgres 40P01) or fails to serialize (40001).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/connection.js';
import { createFabric } from '../src/domain/items/fabrics.service.js';
import { createColor } from '../src/domain/items/colors.service.js';
import { createTopBatch } from '../src/domain/items/tops.service.js';
import { addRoll } from '../src/domain/inventory/shipments.service.js';
import { createAdjustment } from '../src/domain/inventory/adjustments.service.js';
import { create as createCustomerRecord } from '../src/domain/customers/customersService.js';
import { createSale } from '../src/domain/sales/invoices.service.js';
import {
  addItems,
  cancelRequest,
  createRequest,
  markUnavailable,
  openDraftShipment,
} from '../src/domain/stockRequests/stockRequests.service.js';

const RUN_DB = process.env.RUN_DB_TESTS === '1';
const ROUNDS = 12;
let actor: number;
let customerId: number;
let seq = 0;
const stamp = () => `${Date.now()}-${++seq}`;

type TestRoll = { id: number; barcode: string };

async function makeRolls(n: number): Promise<TestRoll[]> {
  const id = stamp();
  const fabric = await createFabric({ name_ar: `قماش تزامن ${id}`, width_cm: 150, grade: 'A', unit: 'kg' });
  const color = await createColor({ name_ar: `لون تزامن ${id}` });
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

const sellFromFactory = (rollId: number) =>
  createSale(
    actor,
    {
      customerId,
      fulfillmentDestination: 'factory_direct',
      lines: [{ rollId, finalPricePerUnit: 100 }],
      payments: [{ method: 'cash', amount: 1000 }],
    },
    null,
  );

const adjustToDamaged = (rollId: number) =>
  createAdjustment(actor, { entity_type: 'roll', roll_id: rollId, new_status: 'damaged', notes_ar: 'سباق' });

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run two operations concurrently. Even rounds start A first, odd rounds start B
 * first (with 0-5 ms jitter), so over the rounds both interleavings really occur.
 * Results come back in the original (A, B) order.
 */
async function race<A, B>(a: () => Promise<A>, b: () => Promise<B>, round: number) {
  const jitter = Math.floor(Math.random() * 6);
  const aFirst = round % 2 === 0;
  const pa = aFirst ? a() : sleep(jitter).then(a);
  const pb = aFirst ? sleep(jitter).then(b) : b();
  const [ra, rb] = await Promise.allSettled([pa, pb]);
  return [ra, rb] as const;
}

function errCode(r: PromiseSettledResult<unknown>): string {
  if (r.status === 'fulfilled') return 'OK';
  const e = r.reason as { code?: string; message?: string };
  return e.code ?? e.message ?? 'ERR';
}

function expectNoConcurrencyFailure(...results: PromiseSettledResult<unknown>[]) {
  for (const r of results) {
    const c = errCode(r);
    expect(c, 'deadlock / serialization failure').not.toBe('40P01');
    expect(c, 'deadlock / serialization failure').not.toBe('40001');
  }
}

async function rollOf(id: number) {
  return db('rolls').where({ id }).first('status', 'warehouse');
}

async function itemsOf(rollId: number) {
  return db('stock_request_items').where({ roll_id: rollId }).orderBy('id');
}

async function expectStatusConsistent(requestId: number) {
  const stored = (await db('stock_requests').where({ id: requestId }).first('status')).status;
  const derived = (await db.raw('SELECT stock_request_derived_status(?) AS s', [requestId])).rows[0].s;
  expect(stored).toBe(derived);
}

/** The roll left factory stock => no reservation may survive on it. */
async function expectNoLiveReservationIfTaken(rollId: number) {
  const roll = await rollOf(rollId);
  const gone = roll.warehouse !== 'factory' || !['in_stock', 'in_transit'].includes(roll.status);
  if (gone) {
    const live = (await itemsOf(rollId)).filter((i) => i.status === 'requested' || i.status === 'packing');
    expect(live, `roll ${rollId} is ${roll.status}/${roll.warehouse} but still reserved`).toHaveLength(0);
  }
}

describe.skipIf(!RUN_DB).sequential('stock requests — concurrency', () => {
  beforeAll(async () => {
    const a = await db('users').whereIn('role', ['owner', 'super_admin']).orderBy('id').first('id');
    if (!a) throw new Error('TEST_ACTOR_NOT_FOUND');
    actor = Number(a.id);
    const serial = String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 90) + 10);
    const c = await createCustomerRecord(actor, { name_ar: `عميل تزامن ${stamp()}`, phone: `011${serial}` });
    customerId = Number(c.id);
  });

  afterAll(async () => {
    if (RUN_DB) await db.destroy();
  });

  it('sanity: a factory-direct sale of an unreserved top works in this database (so the races below are real)', async () => {
    const [r] = await makeRolls(1);
    await sellFromFactory(r.id);
    expect((await rollOf(r.id)).status).toBe('sold');
  });

  it('DETERMINISTIC: a sale already in flight when the request arrives wins; the request then fails cleanly', async () => {
    const [roll] = await makeRolls(1);
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    let locked!: () => void;
    const lockedP = new Promise<void>((r) => { locked = r; });

    // "the sale": holds the roll lock, then marks it sold on commit
    const sale = db.transaction(async (trx) => {
      await trx('rolls').where({ id: roll.id }).forUpdate().first('id');
      locked();
      await held;
      await trx('rolls').where({ id: roll.id }).update({ status: 'sold' });
    });
    await lockedP;

    const request = createRequest(actor, { roll_ids: [roll.id] }).then(() => 'OK', (e: Error) => e.message);
    await sleep(200); // the request is now blocked on the roll lock
    release();
    await sale;

    expect(await request).toBe('ROLL_NOT_AVAILABLE');
    expect(await itemsOf(roll.id)).toHaveLength(0);
  });

  it('DETERMINISTIC: a request in flight when the sale arrives; the sale then releases the reservation', async () => {
    const [roll] = await makeRolls(1);
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    let reserved!: () => void;
    const reservedP = new Promise<void>((r) => { reserved = r; });

    // "the request": locks the roll and inserts the reservation but has not committed yet
    const [{ id: requestId }] = await db('stock_requests')
      .insert({ request_no: `REQ-DET-${stamp()}`, requested_by_user_id: actor }).returning('id');
    const request = db.transaction(async (trx) => {
      await trx('rolls').where({ id: roll.id }).forUpdate().first('id');
      await trx('stock_request_items').insert({ request_id: requestId, roll_id: roll.id, status: 'requested' });
      reserved();
      await held;
    });
    await reservedP;

    const sale = sellFromFactory(roll.id).then(() => 'OK', (e: Error) => e.message);
    await sleep(200); // the sale is now blocked behind the uncommitted reservation
    release();
    await request;

    expect(await sale).toBe('OK');
    const items = await itemsOf(roll.id);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('unavailable'); // released by the trigger the moment the sale committed
    expect(items[0].unavailable_by_user_id).toBeNull();
    expect((await rollOf(roll.id)).status).toBe('sold');
    await expectStatusConsistent(Number(requestId));
  });

  it('two requests racing for the same top: exactly one wins (also in opposite lock order)', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const [a, b] = await makeRolls(2);
      const results = await Promise.allSettled([
        createRequest(actor, { roll_ids: [a.id, b.id] }),
        createRequest(actor, { roll_ids: [b.id, a.id] }),
        createRequest(actor, { roll_ids: [a.id] }),
      ]);
      expectNoConcurrencyFailure(...results);
      expect(results.filter((r) => r.status === 'fulfilled').length, `round ${i}`).toBe(1);
      for (const r of results.filter((x) => x.status === 'rejected')) expect(errCode(r)).toBe('ROLL_ALREADY_REQUESTED');
      for (const roll of [a, b]) {
        const live = (await itemsOf(roll.id)).filter((x) => x.status === 'requested');
        expect(live.length, `round ${i} roll ${roll.id}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('request vs factory-direct SALE: a sold top is never left reserved', async () => {
    let requestWon = 0;
    let saleWon = 0;
    for (let i = 0; i < ROUNDS; i++) {
      const [roll] = await makeRolls(1);
      const [req, sale] = await race(() => createRequest(actor, { roll_ids: [roll.id] }), () => sellFromFactory(roll.id), i);
      expectNoConcurrencyFailure(req, sale);

      expect(errCode(sale), `round ${i} sale`).toBe('OK'); // a sale is never blocked by a reservation
      expect((await rollOf(roll.id)).status).toBe('sold');
      await expectNoLiveReservationIfTaken(roll.id);

      const items = await itemsOf(roll.id);
      if (req.status === 'fulfilled') {
        requestWon++;
        // the request committed first; the sale then released the reservation, with history
        expect(items).toHaveLength(1);
        expect(items[0].status).toBe('unavailable');
        expect(items[0].unavailable_by_user_id).toBeNull();
        expect(items[0].unavailable_reason_ar).toContain('تلقائي');
        const events = await db('stock_request_item_events').where({ item_id: items[0].id }).orderBy('id');
        expect(events.map((e) => e.event_type)).toEqual(['requested', 'auto_unavailable']);
        await expectStatusConsistent(Number(items[0].request_id));
      } else {
        saleWon++;
        expect(errCode(req)).toBe('ROLL_NOT_AVAILABLE'); // the sale won the roll lock first
        expect(items).toHaveLength(0);
      }
    }
    // informational: both interleavings are expected to occur over enough rounds
    console.info(`[request vs sale] request won: ${requestWon}, sale won: ${saleWon}`);
    expect(requestWon + saleWon).toBe(ROUNDS);
  });

  it('request vs ADJUSTMENT to damaged: a damaged top is never left reserved', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const [roll] = await makeRolls(1);
      const [req, adj] = await race(() => createRequest(actor, { roll_ids: [roll.id] }), () => adjustToDamaged(roll.id), i);
      expectNoConcurrencyFailure(req, adj);
      expect(errCode(adj), `round ${i} adjustment`).toBe('OK');
      expect((await rollOf(roll.id)).status).toBe('damaged');
      await expectNoLiveReservationIfTaken(roll.id);
      const items = await itemsOf(roll.id);
      if (req.status === 'fulfilled') {
        expect(items[0].status).toBe('unavailable');
        expect(items[0].unavailable_reason_ar).toContain('تالف');
        await expectStatusConsistent(Number(items[0].request_id));
      } else {
        expect(errCode(req)).toBe('ROLL_NOT_AVAILABLE');
      }
    }
  });

  it('scan onto a shipment vs SALE of the same reserved top: exactly one of them gets it', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const [roll] = await makeRolls(1);
      const reqId = Number((await createRequest(actor, { roll_ids: [roll.id] }))!.id);
      const draft = await openDraftShipment(reqId, actor);

      const [pack, sale] = await race(() => addRoll(Number(draft.id), actor, { roll_id: roll.id }), () => sellFromFactory(roll.id), i);
      expectNoConcurrencyFailure(pack, sale);

      const final = await rollOf(roll.id);
      const item = (await itemsOf(roll.id))[0];
      expect([pack.status, sale.status].filter((s) => s === 'fulfilled'), `round ${i}: both took the same top`).toHaveLength(1);
      if (pack.status === 'fulfilled') {
        expect(final).toMatchObject({ status: 'in_transit', warehouse: 'factory' });
        expect(item.status).toBe('packing');
        expect(['ROLL_NOT_AVAILABLE']).toContain(errCode(sale));
      } else {
        expect(final.status).toBe('sold');
        expect(item.status).toBe('unavailable');
        expect(['ROLL_NOT_IN_REQUEST', 'ROLL_NOT_AVAILABLE']).toContain(errCode(pack));
        expect(await db('shipment_lines').where({ shipment_id: draft.id, roll_id: roll.id })).toHaveLength(0);
      }
      await expectStatusConsistent(reqId);
    }
  });

  it('factory marks unavailable vs scan of the same top: exactly one wins, no deadlock', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const [roll] = await makeRolls(1);
      const reqId = Number((await createRequest(actor, { roll_ids: [roll.id] }))!.id);
      const draft = await openDraftShipment(reqId, actor);
      const itemId = Number((await itemsOf(roll.id))[0].id);

      const [pack, unavail] = await race(
        () => addRoll(Number(draft.id), actor, { roll_id: roll.id }),
        () => markUnavailable(reqId, itemId, actor, 'سباق'),
        i,
      );
      expectNoConcurrencyFailure(pack, unavail);
      expect([pack.status, unavail.status].filter((s) => s === 'fulfilled'), `round ${i}`).toHaveLength(1);

      const item = (await itemsOf(roll.id))[0];
      if (pack.status === 'fulfilled') {
        expect(item.status).toBe('packing');
        expect(errCode(unavail)).toBe('ITEM_BEING_PACKED');
        expect((await rollOf(roll.id)).status).toBe('in_transit');
      } else {
        expect(item.status).toBe('unavailable');
        expect(errCode(pack)).toBe('ROLL_NOT_IN_REQUEST');
        expect((await rollOf(roll.id)).status).toBe('in_stock');
      }
      await expectStatusConsistent(reqId);
    }
  });

  it('factory marks unavailable vs a SALE of the same top: consistent and deadlock-free', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const [roll] = await makeRolls(1);
      const reqId = Number((await createRequest(actor, { roll_ids: [roll.id] }))!.id);
      const itemId = Number((await itemsOf(roll.id))[0].id);

      const [unavail, sale] = await race(() => markUnavailable(reqId, itemId, actor, 'سباق'), () => sellFromFactory(roll.id), i);
      expectNoConcurrencyFailure(unavail, sale);
      expect(errCode(sale)).toBe('OK');

      const item = (await itemsOf(roll.id))[0];
      expect(item.status).toBe('unavailable'); // either by the factory or by the trigger — never left reserved
      if (unavail.status === 'rejected') expect(errCode(unavail)).toBe('ITEM_NOT_REQUESTED'); // the sale got there first
      await expectNoLiveReservationIfTaken(roll.id);
      await expectStatusConsistent(reqId);
    }
  });

  it('cancelling the request vs adding tops to it: a cancelled request never keeps an active item', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const [a, b] = await makeRolls(2);
      const reqId = Number((await createRequest(actor, { roll_ids: [a.id] }))!.id);

      const [cancel, add] = await race(
        () => cancelRequest(reqId, actor, 'سباق إلغاء'),
        () => addItems(reqId, actor, { roll_ids: [b.id] }),
        i,
      );
      expectNoConcurrencyFailure(cancel, add);

      const request = await db('stock_requests').where({ id: reqId }).first();
      const active = await db('stock_request_items').where({ request_id: reqId }).whereIn('status', ['requested', 'packing']);
      if (request.cancelled_at) {
        expect(active, `round ${i}: cancelled request still holds active items`).toHaveLength(0);
      } else {
        // the cancel lost (nothing to cancel is impossible here), so it must have failed loudly
        expect(errCode(cancel)).not.toBe('OK');
      }
      if (add.status === 'rejected') expect(errCode(add)).toBe('REQUEST_CANCELLED');
      await expectStatusConsistent(reqId);
    }
  });
});
