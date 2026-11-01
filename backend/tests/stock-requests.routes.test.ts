// طلبات الأتواب — the HTTP contract and, above all, WHO may do what:
//   shop_seller    asks / cancels / replaces / reviews shipments; cannot scan or send
//   factory_sender prepares: opens the linked draft, scans, marks unavailable, sends;
//                  cannot ask, cannot review, cannot start a manual shipment any more
//   accountant     read only
//   owner          everything (including the manual fallback)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';
import { db } from '../src/db/connection.js';
import { signJwt, type Role } from '../src/lib/jwt.js';
import { createFabric } from '../src/domain/items/fabrics.service.js';
import { createColor } from '../src/domain/items/colors.service.js';
import { createTopBatch } from '../src/domain/items/tops.service.js';

const RUN_DB = process.env.RUN_DB_TESTS === '1';

type Auth = { Authorization: string };
const users: Partial<Record<Role, { id: number; auth: Auth }>> = {};
let seq = 0;
const stamp = () => `${Date.now()}-${++seq}`;

async function makeUser(role: Role): Promise<{ id: number; auth: Auth }> {
  const [{ id }] = await db('users')
    .insert({ username: `req_${role}_${stamp()}`, password_hash: 'x'.repeat(60), full_name_ar: `مستخدم ${role}`, role, is_active: true })
    .returning('id');
  const meta = await db('users').where({ id }).first('permissions_revision');
  const { token, jti } = signJwt({ sub: Number(id), role, perm_rev: meta.permissions_revision });
  await db('sessions').insert({ user_id: id, jwt_jti: jti, device_info: 'test', ip: '127.0.0.1' });
  return { id: Number(id), auth: { Authorization: `Bearer ${token}` } };
}

async function makeRolls(n: number): Promise<Array<{ id: number; barcode: string }>> {
  const owner = users.owner!.id;
  const s = stamp();
  const fabric = await createFabric({ name_ar: `قماش http ${s}`, width_cm: 150, grade: 'A', unit: 'kg' });
  const color = await createColor({ name_ar: `لون http ${s}` });
  const batch = await createTopBatch(
    { fabric: { id: Number(fabric.id) }, rolls: Array.from({ length: n }, () => ({ color: { id: Number(color.id) }, weight_kg: 10, width_cm: 150 })) },
    owner,
  );
  const ids = batch.rolls.map((r) => Number(r.id));
  await db('rolls').whereIn('id', ids).update({ warehouse: 'factory', status: 'in_stock' });
  const rows = await db('rolls').whereIn('id', ids).orderBy('id').select('id', 'internal_barcode');
  return rows.map((r) => ({ id: Number(r.id), barcode: r.internal_barcode as string }));
}

const shop = () => users.shop_seller!.auth;
const factory = () => users.factory_sender!.auth;
const accountant = () => users.accountant!.auth;
const owner = () => users.owner!.auth;

describe.skipIf(!RUN_DB).sequential('stock requests — HTTP permissions & contract', () => {
  beforeAll(async () => {
    for (const role of ['owner', 'shop_seller', 'factory_sender', 'accountant'] as Role[]) users[role] = await makeUser(role);
  });
  afterAll(async () => {
    if (RUN_DB) await db.destroy();
  });

  it('requires a login', async () => {
    expect((await request(app).get('/api/stock-requests')).status).toBe(401);
    expect((await request(app).post('/api/stock-requests').send({ roll_ids: [1] })).status).toBe(401);
  });

  it('the full flow over HTTP, each step by the role that owns it', async () => {
    const rolls = await makeRolls(3);
    const [a, b, c] = rolls;

    // --- shop browses what is available, then asks
    const avail = await request(app).get('/api/stock-requests/available-rolls').set(shop());
    expect(avail.status).toBe(200);
    expect(avail.body.some((r: { id: number }) => r.id === a.id)).toBe(true);
    expect((await request(app).get('/api/stock-requests/available-rolls').set(factory())).status).toBe(403); // factory has no business picking

    const bad = await request(app).post('/api/stock-requests').set(shop()).send({ roll_ids: [] });
    expect(bad.status).toBe(400);
    expect((await request(app).post('/api/stock-requests').set(factory()).send({ roll_ids: [a.id] })).status).toBe(403);
    expect((await request(app).post('/api/stock-requests').set(accountant()).send({ roll_ids: [a.id] })).status).toBe(403);

    const created = await request(app).post('/api/stock-requests').set(shop()).send({ roll_ids: [a.id, b.id], notes_ar: 'http' });
    expect(created.status).toBe(201);
    const reqId = created.body.id as number;
    expect(created.body.request_no).toMatch(/^REQ-\d{4}-\d{6}$/);
    expect(created.body.requested_by_user_id).toBe(users.shop_seller!.id);

    // a taken top is refused with its barcode
    const dup = await request(app).post('/api/stock-requests').set(shop()).send({ roll_ids: [a.id] });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('ROLL_ALREADY_REQUESTED');
    expect(dup.body.barcodes).toEqual([a.barcode]);

    // --- everybody with read access sees it; the accountant can look but not touch
    for (const who of [shop(), factory(), accountant(), owner()]) {
      expect((await request(app).get(`/api/stock-requests/${reqId}`).set(who)).status).toBe(200);
      expect((await request(app).get('/api/stock-requests?active=1').set(who)).status).toBe(200);
    }
    expect((await request(app).get('/api/stock-requests/999999999').set(shop())).status).toBe(404);
    expect((await request(app).post(`/api/stock-requests/${reqId}/items`).set(accountant()).send({ roll_ids: [c.id] })).status).toBe(403);

    // --- the shop cannot prepare; the factory can
    expect((await request(app).post(`/api/stock-requests/${reqId}/shipments`).set(shop())).status).toBe(403);
    const draftRes = await request(app).post(`/api/stock-requests/${reqId}/shipments`).set(factory());
    expect(draftRes.status).toBe(201);
    const shipmentId = draftRes.body.id as number;
    expect(draftRes.body.stock_request_id).toBe(reqId);

    expect((await request(app).post(`/api/shipments/${shipmentId}/rolls`).set(shop()).send({ internal_barcode: a.barcode })).status).toBe(403);

    // unrequested top: refused by the scanner, with a clear Arabic message
    const unrequested = await request(app).post(`/api/shipments/${shipmentId}/rolls`).set(factory()).send({ internal_barcode: c.barcode });
    expect(unrequested.status).toBe(409);
    expect(unrequested.body.error).toBe('ROLL_NOT_IN_REQUEST');
    expect(unrequested.body.message).toContain('غير مطلوب');

    expect((await request(app).post(`/api/shipments/${shipmentId}/rolls`).set(factory()).send({ internal_barcode: a.barcode })).status).toBe(201);
    const twice = await request(app).post(`/api/shipments/${shipmentId}/rolls`).set(factory()).send({ internal_barcode: a.barcode });
    expect(twice.status).toBe(409);
    expect(twice.body.error).toBe('ROLL_ALREADY_SCANNED');

    // --- unavailable: factory only, reason mandatory
    const detail1 = await request(app).get(`/api/stock-requests/${reqId}`).set(factory());
    const itemB = detail1.body.items.find((i: { roll_id: number }) => i.roll_id === b.id);
    const noReason = await request(app).post(`/api/stock-requests/${reqId}/items/${itemB.id}/unavailable`).set(factory()).send({});
    expect(noReason.status).toBe(400);
    expect((await request(app).post(`/api/stock-requests/${reqId}/items/${itemB.id}/unavailable`).set(shop()).send({ reason_ar: 'x1' })).status).toBe(403);
    const unavail = await request(app).post(`/api/stock-requests/${reqId}/items/${itemB.id}/unavailable`).set(factory()).send({ reason_ar: 'مكسور' });
    expect(unavail.status).toBe(200);
    expect(unavail.body.items.find((i: { id: number }) => i.id === itemB.id).outcome).toBe('unavailable');

    // --- send: the shop cannot review before; afterwards only the shop (approve) can
    expect((await request(app).post(`/api/shipments/${shipmentId}/submit`).set(factory())).status).toBe(200);
    const detail2 = await request(app).get(`/api/stock-requests/${reqId}`).set(shop());
    expect(detail2.body.status).toBe('awaiting_review');
    const lineId = detail2.body.items.find((i: { roll_id: number }) => i.roll_id === a.id).line_id as number;

    const factoryReview = await request(app).post(`/api/shipments/${shipmentId}/lines/review-bulk`).set(factory()).send({ line_ids: [lineId], action: 'accept' });
    expect(factoryReview.status).toBe(403);
    const shopReview = await request(app).post(`/api/shipments/${shipmentId}/lines/review-bulk`).set(shop()).send({ line_ids: [lineId], action: 'accept' });
    expect(shopReview.status).toBe(200);
    const done = await request(app).get(`/api/stock-requests/${reqId}`).set(shop());
    expect(done.body.status).toBe('completed');
    expect(done.body.counts).toMatchObject({ accepted: 1, unavailable: 1, total: 2 });

    // the shipment endpoints expose the link
    const ship = await request(app).get(`/api/shipments/${shipmentId}`).set(shop());
    expect(ship.body.stock_request_id).toBe(reqId);
    expect(ship.body.request_no).toBe(created.body.request_no);

    // --- replacement over HTTP; cancel rules
    const replaceItem = await request(app).post(`/api/stock-requests/${reqId}/items`).set(shop()).send({ roll_ids: [c.id], replaces_item_id: itemB.id });
    expect(replaceItem.status).toBe(201);
    const cancelNoReason = await request(app).post(`/api/stock-requests/${reqId}/cancel`).set(shop()).send({});
    expect(cancelNoReason.status).toBe(400);
    expect((await request(app).post(`/api/stock-requests/${reqId}/cancel`).set(factory()).send({ reason_ar: 'x1' })).status).toBe(403);
    expect((await request(app).post(`/api/stock-requests/${reqId}/cancel`).set(shop()).send({ reason_ar: 'لا حاجة' })).status).toBe(200);

    // summary counters
    expect((await request(app).get('/api/stock-requests/summary').set(factory())).status).toBe(200);
  });

  it('manual shipments: only the owner can still start one; the factory keeps working on drafts it already has', async () => {
    expect((await request(app).post('/api/shipments').set(factory()).send({})).status).toBe(403);
    const refused = await request(app).post('/api/shipments').set(factory()).send({});
    expect(refused.body.error).toBe('SHIPMENT_MANUAL_CREATE_FORBIDDEN');
    expect((await request(app).post('/api/shipments').set(shop()).send({})).status).toBe(403);

    // a draft that EXISTED before this feature (created by the factory user) is still fully usable
    const [roll] = await makeRolls(1);
    const [{ id: legacyId }] = await db('shipments')
      .insert({ shipment_no: `SHP-LEG-${stamp()}`.slice(0, 32), created_by_user_id: users.factory_sender!.id, status: 'draft' })
      .returning('id');
    expect((await request(app).post(`/api/shipments/${legacyId}/rolls`).set(factory()).send({ roll_id: roll.id })).status).toBe(201);
    expect((await request(app).post(`/api/shipments/${legacyId}/submit`).set(factory())).status).toBe(200);

    // the owner may still create a manual one
    const ownerDraft = await request(app).post('/api/shipments').set(owner()).send({});
    expect(ownerDraft.status).toBe(201);
    expect(ownerDraft.body.stock_request_id ?? null).toBeNull();
  });
});
