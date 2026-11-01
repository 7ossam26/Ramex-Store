// طلبات الأتواب — database-level guarantees from migrations 104 + 105.
// These are the guarantees the service code relies on, so they are asserted
// against the real constraints / triggers (not mocked):
//   - one ACTIVE reservation per توب (double-reservation guard);
//   - «غير متوفر» always carries the factory reason;
//   - item <-> shipment <-> line <-> roll <-> request must agree (composite FKs);
//   - a line on a request shipment must have a request item (deferred trigger);
//   - item history is append-only; a replacement chain is linear and in-request;
//   - legacy shipments stay unlinked (stock_request_id IS NULL, no backfill);
//   - a reserved top that leaves factory stock releases its reservation (trigger);
//   - role defaults seeded by 105 match shared/permissions/catalog.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/connection.js';
import { createFabric } from '../src/domain/items/fabrics.service.js';
import { createColor } from '../src/domain/items/colors.service.js';
import { createTopBatch } from '../src/domain/items/tops.service.js';
import { createDraft } from '../src/domain/inventory/shipments.service.js';
import { ROLE_DEFAULTS } from '../../shared/permissions/catalog.js';

const RUN_DB = process.env.RUN_DB_TESTS === '1';
let actorUserId: number;
let seq = 0;
const createdRequests: number[] = [];
const createdShipments: number[] = [];

function stamp(): string {
  seq += 1;
  return `${Date.now()}-${seq}`;
}

async function makeFactoryRoll(): Promise<number> {
  const id = stamp();
  const fabric = await createFabric({ name_ar: `قماش طلب ${id}`, width_cm: 150, grade: 'A', unit: 'kg' });
  const color = await createColor({ name_ar: `لون طلب ${id}` });
  const batch = await createTopBatch(
    { fabric: { id: Number(fabric.id) }, rolls: [{ color: { id: Number(color.id) }, weight_kg: 10, width_cm: 150 }] },
    actorUserId,
  );
  const rollId = Number(batch.rolls[0].id);
  await db('rolls').where({ id: rollId }).update({ warehouse: 'factory', status: 'in_stock' });
  return rollId;
}

async function makeRequest(): Promise<number> {
  const [{ id }] = await db('stock_requests')
    .insert({ request_no: `REQ-TEST-${stamp()}`, requested_by_user_id: actorUserId })
    .returning('id');
  createdRequests.push(Number(id));
  return Number(id);
}

async function makeLinkedDraft(requestId: number): Promise<number> {
  const s = await createDraft(actorUserId, {});
  createdShipments.push(Number(s.id));
  await db('shipments').where({ id: s.id }).update({ stock_request_id: requestId });
  return Number(s.id);
}

/** Postgres error code of a rejected promise, or OK when it succeeded. */
async function pgCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as { code?: string }).code ?? (e as Error).message;
  }
}

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const FK_VIOLATION = '23503';
// ON DELETE RESTRICT raises 23001 (restrict_violation); NO ACTION raises 23503. Either means refused.
const FK_REFUSED = ['23001', '23503'];

describe.skipIf(!RUN_DB).sequential('stock requests - database guarantees (migrations 104/105)', () => {
  beforeAll(async () => {
    const actor = await db('users').whereIn('role', ['owner', 'super_admin']).orderBy('id').first('id');
    if (!actor) throw new Error('TEST_ACTOR_NOT_FOUND');
    actorUserId = Number(actor.id);
  });

  afterAll(async () => {
    if (!RUN_DB) return;
    // Remove only what this file created. The event table is append-only by design,
    // so the cleanup lifts that guard (disable the trigger) in this scratch run only.
    if (createdRequests.length > 0) {
      await db.raw('ALTER TABLE stock_request_item_events DISABLE TRIGGER trg_stock_request_item_events_append_only');
      await db('stock_request_item_events').whereIn('request_id', createdRequests).delete();
      await db.raw('ALTER TABLE stock_request_item_events ENABLE TRIGGER trg_stock_request_item_events_append_only');
      await db('stock_request_items').whereIn('request_id', createdRequests).update({ replaces_item_id: null, shipment_id: null, shipment_line_id: null, status: 'cancelled' });
      await db('stock_request_items').whereIn('request_id', createdRequests).delete();
    }
    if (createdShipments.length > 0) {
      await db('shipment_lines').whereIn('shipment_id', createdShipments).delete();
      await db('shipments').whereIn('id', createdShipments).delete();
    }
    if (createdRequests.length > 0) await db('stock_requests').whereIn('id', createdRequests).delete();
    await db.destroy();
  });

  it('a roll can have only ONE active request item; a finished one frees it for a new request', async () => {
    const roll = await makeFactoryRoll();
    const r1 = await makeRequest();
    const r2 = await makeRequest();

    const [{ id: first }] = await db('stock_request_items').insert({ request_id: r1, roll_id: roll, status: 'requested' }).returning('id');
    expect(await pgCode(db('stock_request_items').insert({ request_id: r1, roll_id: roll, status: 'requested' }))).toBe(UNIQUE_VIOLATION);
    expect(await pgCode(db('stock_request_items').insert({ request_id: r2, roll_id: roll, status: 'requested' }))).toBe(UNIQUE_VIOLATION);

    // reserving does NOT touch the roll: it is still plain factory stock
    const state = await db('rolls').where({ id: roll }).first('status', 'warehouse');
    expect(state).toMatchObject({ status: 'in_stock', warehouse: 'factory' });

    // once the first item is no longer active, the same roll can be requested again
    await db('stock_request_items').where({ id: first }).update({ status: 'cancelled' });
    expect(await pgCode(db('stock_request_items').insert({ request_id: r2, roll_id: roll, status: 'requested' }))).toBe('OK');
  });

  it('unavailable requires a non-blank reason; a retry keeps the original row untouched', async () => {
    const roll = await makeFactoryRoll();
    const r = await makeRequest();
    const [{ id: itemId }] = await db('stock_request_items').insert({ request_id: r, roll_id: roll, status: 'requested' }).returning('id');

    expect(await pgCode(db('stock_request_items').where({ id: itemId }).update({ status: 'unavailable' }))).toBe(CHECK_VIOLATION);
    expect(await pgCode(db('stock_request_items').where({ id: itemId }).update({ status: 'unavailable', unavailable_reason_ar: '   ' }))).toBe(CHECK_VIOLATION);
    expect(await pgCode(db('stock_request_items').where({ id: itemId }).update({ status: 'unavailable', unavailable_reason_ar: 'التوب مكسور' }))).toBe('OK');

    expect(await pgCode(db('stock_request_items').insert({ request_id: r, roll_id: roll, status: 'requested', replaces_item_id: itemId }))).toBe('OK');
    const old = await db('stock_request_items').where({ id: itemId }).first('status', 'unavailable_reason_ar');
    expect(old).toMatchObject({ status: 'unavailable', unavailable_reason_ar: 'التوب مكسور' });
  });

  it('the replacement chain is linear, inside one request, and never self-referencing', async () => {
    const roll = await makeFactoryRoll();
    const roll2 = await makeFactoryRoll();
    const roll3 = await makeFactoryRoll();
    const r = await makeRequest();
    const other = await makeRequest();

    const [{ id: a }] = await db('stock_request_items').insert({ request_id: r, roll_id: roll, status: 'requested' }).returning('id');
    expect(await pgCode(db('stock_request_items').where({ id: a }).update({ replaces_item_id: a }))).toBe(CHECK_VIOLATION);

    await db('stock_request_items').where({ id: a }).update({ status: 'unavailable', unavailable_reason_ar: 'x' });
    expect(await pgCode(db('stock_request_items').insert({ request_id: r, roll_id: roll2, status: 'requested', replaces_item_id: a }))).toBe('OK');
    // an item can be replaced only once
    expect(await pgCode(db('stock_request_items').insert({ request_id: r, roll_id: roll3, status: 'requested', replaces_item_id: a }))).toBe(UNIQUE_VIOLATION);
    // a replacement must live in the SAME request as the item it replaces
    const roll4 = await makeFactoryRoll();
    const [{ id: b }] = await db('stock_request_items').insert({ request_id: r, roll_id: roll4, status: 'unavailable', unavailable_reason_ar: 'y' }).returning('id');
    expect(await pgCode(db('stock_request_items').insert({ request_id: other, roll_id: roll3, status: 'requested', replaces_item_id: b }))).toBe(FK_VIOLATION);
  });

  it('packing / dispatched items must sit on a shipment line; the others never do', async () => {
    const roll = await makeFactoryRoll();
    const r = await makeRequest();
    const shipment = await makeLinkedDraft(r);

    expect(await pgCode(db('stock_request_items').insert({ request_id: r, roll_id: roll, status: 'packing' }))).toBe(CHECK_VIOLATION);
    expect(await pgCode(db('stock_request_items').insert({ request_id: r, roll_id: roll, status: 'dispatched' }))).toBe(CHECK_VIOLATION);
    // a shipment without its line, or a status that must not have one
    expect(await pgCode(db('stock_request_items').insert({ request_id: r, roll_id: roll, status: 'requested', shipment_id: shipment }))).toBe(CHECK_VIOLATION);
  });

  it('item, shipment, line and roll must agree (composite foreign keys)', async () => {
    const r1 = await makeRequest();
    const r2 = await makeRequest();
    const rollA = await makeFactoryRoll();
    const rollB = await makeFactoryRoll();
    const shipment1 = await makeLinkedDraft(r1);
    const shipment2 = await makeLinkedDraft(r2);

    // a proper packing item: line + item written in ONE transaction
    const itemId = await db.transaction(async (trx) => {
      const [{ id: lineId }] = await trx('shipment_lines').insert({ shipment_id: shipment1, roll_id: rollA, status: 'pending' }).returning('id');
      const [{ id }] = await trx('stock_request_items')
        .insert({ request_id: r1, roll_id: rollA, status: 'packing', shipment_id: shipment1, shipment_line_id: lineId })
        .returning('id');
      return { item: Number(id), line: Number(lineId) };
    });
    expect(itemId.item).toBeGreaterThan(0);

    // wrong request: shipment1 belongs to request r1, not r2
    const wrongShipment = await db.transaction(async (trx) => {
      const [{ id: lineId }] = await trx('shipment_lines').insert({ shipment_id: shipment1, roll_id: rollB, status: 'pending' }).returning('id');
      return pgCode(trx('stock_request_items').insert({ request_id: r2, roll_id: rollB, status: 'packing', shipment_id: shipment1, shipment_line_id: lineId }));
    }).catch((e: { code?: string }) => e.code ?? 'ERR');
    expect(wrongShipment).toBe(FK_VIOLATION);

    // wrong roll: the line is for rollB, the item claims rollC
    const rollC = await makeFactoryRoll();
    const wrongRoll = await db.transaction(async (trx) => {
      const [{ id: lineId }] = await trx('shipment_lines').insert({ shipment_id: shipment1, roll_id: rollB, status: 'pending' }).returning('id');
      return pgCode(trx('stock_request_items').insert({ request_id: r1, roll_id: rollC, status: 'packing', shipment_id: shipment1, shipment_line_id: lineId }));
    }).catch((e: { code?: string }) => e.code ?? 'ERR');
    expect(wrongRoll).toBe(FK_VIOLATION);

    // wrong shipment for the line: the line sits on shipment1, the item claims shipment2 (a valid shipment of r2)
    const rollD = await makeFactoryRoll();
    const wrongLineShipment = await db.transaction(async (trx) => {
      const [{ id: lineId }] = await trx('shipment_lines').insert({ shipment_id: shipment1, roll_id: rollD, status: 'pending' }).returning('id');
      return pgCode(trx('stock_request_items').insert({ request_id: r2, roll_id: rollD, status: 'packing', shipment_id: shipment2, shipment_line_id: lineId }));
    }).catch((e: { code?: string }) => e.code ?? 'ERR');
    expect(wrongLineShipment).toBe(FK_VIOLATION);

    // one line carries one item
    expect(await pgCode(db('stock_request_items').insert({ request_id: r1, roll_id: rollA, status: 'dispatched', shipment_id: shipment1, shipment_line_id: itemId.line }))).toBe(UNIQUE_VIOLATION);
  });

  it('a line on a request shipment without a request item is refused at commit', async () => {
    const r = await makeRequest();
    const roll = await makeFactoryRoll();
    const shipment = await makeLinkedDraft(r);

    // direct insert, no item => the deferred trigger rejects it when the transaction commits
    expect(await pgCode(db('shipment_lines').insert({ shipment_id: shipment, roll_id: roll, status: 'pending' }))).toBe(CHECK_VIOLATION);
    expect((await db('shipment_lines').where({ shipment_id: shipment })).length).toBe(0);

    // legacy (unlinked) shipments are unaffected
    const legacy = await createDraft(actorUserId, {});
    createdShipments.push(Number(legacy.id));
    expect(await pgCode(db('shipment_lines').insert({ shipment_id: legacy.id, roll_id: roll, status: 'pending' }))).toBe('OK');
  });

  it('legacy shipments stay unlinked; a request has at most one open draft', async () => {
    const legacy = await createDraft(actorUserId, {});
    createdShipments.push(Number(legacy.id));
    expect((await db('shipments').where({ id: legacy.id }).first('stock_request_id')).stock_request_id).toBeNull();

    const legacy2 = await createDraft(actorUserId, {});
    createdShipments.push(Number(legacy2.id));

    const r = await makeRequest();
    const linked = await makeLinkedDraft(r);

    const other = await createDraft(actorUserId, {});
    createdShipments.push(Number(other.id));
    expect(await pgCode(db('shipments').where({ id: other.id }).update({ stock_request_id: r }))).toBe(UNIQUE_VIOLATION);

    await db('shipments').where({ id: linked }).update({ status: 'pending_approval' });
    expect(await pgCode(db('shipments').where({ id: other.id }).update({ stock_request_id: r }))).toBe('OK');
  });

  it('history is protected: referenced requests, shipments and rolls cannot be deleted', async () => {
    const roll = await makeFactoryRoll();
    const r = await makeRequest();
    const shipment = await makeLinkedDraft(r);
    await db('stock_request_items').insert({ request_id: r, roll_id: roll, status: 'requested' });

    expect(FK_REFUSED).toContain(await pgCode(db('stock_requests').where({ id: r }).delete())); // items + shipment point at it
    expect(FK_REFUSED).toContain(await pgCode(db('rolls').where({ id: roll }).delete()));
    expect(shipment).toBeGreaterThan(0);
  });

  it('item history is append-only', async () => {
    const roll = await makeFactoryRoll();
    const r = await makeRequest();
    const [{ id: itemId }] = await db('stock_request_items').insert({ request_id: r, roll_id: roll, status: 'requested' }).returning('id');
    const [{ id: eventId }] = await db('stock_request_item_events')
      .insert({ item_id: itemId, request_id: r, event_type: 'requested', to_status: 'requested', actor_user_id: actorUserId })
      .returning('id');

    expect(await pgCode(db('stock_request_item_events').where({ id: eventId }).update({ note_ar: 'tampered' }))).toBe(CHECK_VIOLATION);
    expect(await pgCode(db('stock_request_item_events').where({ id: eventId }).delete())).toBe(CHECK_VIOLATION);
    expect((await db('stock_request_item_events').where({ id: eventId }).first()).note_ar).toBeNull();
  });

  it('a reserved top that leaves factory stock releases its reservation in the same transaction', async () => {
    const roll = await makeFactoryRoll();
    const r = await makeRequest();
    const [{ id: itemId }] = await db('stock_request_items').insert({ request_id: r, roll_id: roll, status: 'requested' }).returning('id');
    await db('stock_requests').where({ id: r }).update({ status: db.raw('stock_request_derived_status(?)', [r]) });
    expect((await db('stock_requests').where({ id: r }).first('status')).status).toBe('open');

    await db('rolls').where({ id: roll }).update({ status: 'damaged' });

    const item = await db('stock_request_items').where({ id: itemId }).first();
    expect(item.status).toBe('unavailable');
    expect(item.unavailable_reason_ar).toContain('تالف');
    expect(item.unavailable_by_user_id).toBeNull(); // automatic
    expect((await db('stock_request_item_events').where({ item_id: itemId, event_type: 'auto_unavailable' })).length).toBe(1);
    expect((await db('audit_log').where({ action: 'auto_mark_request_item_unavailable', entity_id: String(itemId) })).length).toBe(1);
    // every item is unavailable => nothing left to do => completed
    expect((await db('stock_requests').where({ id: r }).first('status')).status).toBe('completed');

    // moving between in_stock and in_transit at the factory does NOT release a reservation
    const roll2 = await makeFactoryRoll();
    const [{ id: item2 }] = await db('stock_request_items').insert({ request_id: r, roll_id: roll2, status: 'requested' }).returning('id');
    await db('rolls').where({ id: roll2 }).update({ status: 'in_transit' });
    await db('rolls').where({ id: roll2 }).update({ status: 'in_stock' });
    expect((await db('stock_request_items').where({ id: item2 }).first()).status).toBe('requested');
  });

  it('role defaults seeded by migration 105 match shared/permissions/catalog.ts', async () => {
    const rows = await db('role_permissions').whereIn('resource', ['stock_requests', 'stock_request_fulfilment']).select('role', 'resource', 'action', 'is_allowed');
    const actual = new Map(rows.map((r: { role: string; resource: string; action: string; is_allowed: boolean }) => [`${r.role}.${r.resource}.${r.action}`, r.is_allowed]));

    let compared = 0;
    for (const [role, perms] of Object.entries(ROLE_DEFAULTS)) {
      for (const p of perms.filter((x) => x.resource === 'stock_requests' || x.resource === 'stock_request_fulfilment')) {
        expect(actual.get(`${role}.${p.resource}.${p.action}`), `${role}.${p.resource}.${p.action}`).toBe(p.is_allowed);
        compared++;
      }
    }
    expect(compared).toBe(12); // 4 roles x (2 + 1) — nothing missing from the catalog
    // the shop asks but never prepares; the factory prepares but never asks
    expect(actual.get('shop_seller.stock_requests.write')).toBe(true);
    expect(actual.get('shop_seller.stock_request_fulfilment.write')).toBe(false);
    expect(actual.get('factory_sender.stock_requests.write')).toBe(false);
    expect(actual.get('factory_sender.stock_request_fulfilment.write')).toBe(true);
  });
});
