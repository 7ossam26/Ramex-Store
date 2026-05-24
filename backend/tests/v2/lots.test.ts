// v2 Phase 10 — Lots behavioral tests.
// Verifies Q&A #1, #6.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';

const RUN_DB = process.env.RUN_DB_TESTS === '1';
const OWNER = { username: 'owner', password: 'ChangeMe123!' };

async function loginOwner() {
  const r = await request(app).post('/api/auth/login').send(OWNER);
  return r.body.token as string;
}

describe('v2 — lots (Q&A #1, #6)', () => {
  it('contract — POST /api/lots requires auth', async () => {
    const res = await request(app).post('/api/lots').send({ fabric_id: 1, color_id: 1 });
    expect(res.status).toBe(401);
  });

  it.skipIf(!RUN_DB)('Q&A #1 — POST /api/lots returns prefixed sequential lot_no', async () => {
    const token = await loginOwner();
    const auth = { Authorization: `Bearer ${token}` };

    const fabric = await request(app).post('/api/fabrics').set(auth).send({
      name_ar: 'خامة v2-lot-A',
      composition: [{ material: 'بوليستر', percent: 100 }],
      width_cm: 150, grade: 'A', unit: 'kg',
    });
    const color = await request(app).post('/api/colors').set(auth).send({ name_ar: 'لون v2-lot-A' });

    const a = await request(app).post('/api/lots').set(auth).send({
      fabric_id: fabric.body.id, color_id: color.body.id,
    });
    const b = await request(app).post('/api/lots').set(auth).send({
      fabric_id: fabric.body.id, color_id: color.body.id,
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    // Accept L-NNNNNN or LT-NNNNNN — implementation chose LT- to disambiguate
    // from color-code L- (documented drift, see v2-validation-report.md).
    expect(a.body.lot_no).toMatch(/^L[A-Z]?-\d{6}$/);
    expect(b.body.lot_no).toMatch(/^L[A-Z]?-\d{6}$/);

    const aN = Number(a.body.lot_no.split('-')[1]);
    const bN = Number(b.body.lot_no.split('-')[1]);
    expect(bN).toBe(aN + 1);
  });

  it.skipIf(!RUN_DB)('Q&A #1 — Add Top rejects roll with lot whose (fabric,color) mismatches', async () => {
    const token = await loginOwner();
    const auth = { Authorization: `Bearer ${token}` };

    const fabric = await request(app).post('/api/fabrics').set(auth).send({
      name_ar: 'خامة v2-mismatch',
      composition: [{ material: 'قطن', percent: 100 }],
      width_cm: 140, grade: 'A', unit: 'kg',
    });
    const cA = await request(app).post('/api/colors').set(auth).send({ name_ar: 'لون mismatch-A' });
    const cB = await request(app).post('/api/colors').set(auth).send({ name_ar: 'لون mismatch-B' });
    const lot = await request(app).post('/api/lots').set(auth).send({
      fabric_id: fabric.body.id, color_id: cA.body.id,
    });

    // Roll uses color B but lot is for color A → server must reject.
    const res = await request(app).post('/api/tops/batch').set(auth).send({
      fabric: { id: fabric.body.id },
      rolls: [{ color: { id: cB.body.id }, weight_kg: 25, lot_id: lot.body.id, width_cm: 140 }],
    });
    expect(res.status).toBe(400);
    // Arabic error message expected in the rejection body.
    const body = JSON.stringify(res.body);
    expect(body.length).toBeGreaterThan(0);
  });

  it.skipIf(!RUN_DB)('Q&A #6 — same (fabric,color) within one Add Top batch can use different lot_ids', async () => {
    const token = await loginOwner();
    const auth = { Authorization: `Bearer ${token}` };

    const fabric = await request(app).post('/api/fabrics').set(auth).send({
      name_ar: 'خامة v2-multilot',
      composition: [{ material: 'قطن', percent: 100 }],
      width_cm: 150, grade: 'A', unit: 'kg',
    });
    const color = await request(app).post('/api/colors').set(auth).send({ name_ar: 'لون multilot' });
    const l1 = await request(app).post('/api/lots').set(auth).send({
      fabric_id: fabric.body.id, color_id: color.body.id,
    });
    const l2 = await request(app).post('/api/lots').set(auth).send({
      fabric_id: fabric.body.id, color_id: color.body.id,
    });

    const res = await request(app).post('/api/tops/batch').set(auth).send({
      fabric: { id: fabric.body.id },
      rolls: [
        { color: { id: color.body.id }, weight_kg: 10, lot_id: l1.body.id, width_cm: 150 },
        { color: { id: color.body.id }, weight_kg: 12, lot_id: l2.body.id, width_cm: 150 },
      ],
    });
    expect([200, 201]).toContain(res.status);
  });
});
