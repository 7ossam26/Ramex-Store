// v2 Phase 10 — Fabric unit + supplier_code + dropped purchase_price_egp.
// Q&A #2, #3, #4, #1.2.
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { db } from '../../src/db/connection.js';

const RUN_DB = process.env.RUN_DB_TESTS === '1';
const OWNER = { username: 'owner', password: 'ChangeMe123!' };

async function loginOwner() {
  const r = await request(app).post('/api/auth/login').send(OWNER);
  return r.body.token as string;
}

describe('v2 — fabric (Q&A #2-4, #1.2)', () => {
  afterAll(async () => {
    if (RUN_DB) await db.destroy();
  });

  it.skipIf(!RUN_DB)('Q&A #4 — kg-fabric and meter-fabric persist unit; cm rejected by CHECK', async () => {
    const token = await loginOwner();
    const auth = { Authorization: `Bearer ${token}` };

    const kg = await request(app).post('/api/fabrics').set(auth).send({
      name_ar: 'كيلو-ف', composition: [{ material: 'قطن', percent: 100 }],
      width_cm: 150, grade: 'A', unit: 'kg',
    });
    expect(kg.status).toBe(201);
    expect(kg.body.unit).toBe('kg');

    const meter = await request(app).post('/api/fabrics').set(auth).send({
      name_ar: 'متر-ف', composition: [{ material: 'قطن', percent: 100 }],
      width_cm: 150, grade: 'A', unit: 'meter',
    });
    expect(meter.status).toBe(201);
    expect(meter.body.unit).toBe('meter');

    // CHECK constraint — bypass zod via raw insert.
    await expect(
      db('fabrics').insert({
        code: `Z-${Date.now()}`, name_ar: 'سم-ف',
        composition_json: JSON.stringify([{ material: 'قطن', percent: 100 }]),
        width_cm: 150, grade: 'A', unit: 'cm',
      }),
    ).rejects.toThrow();
  });

  it.skipIf(!RUN_DB)('Q&A #2/#3 — rolls.purchase_price_egp dropped (insert fails)', async () => {
    await expect(
      db('rolls').insert({
        fabric_id: 1, color_id: 1, weight_kg: 1,
        warehouse: 'shop', status: 'in_stock',
        purchase_price_egp: 100,
      }),
    ).rejects.toThrow();
  });

  it.skipIf(!RUN_DB)('Q&A #1.2 — supplier_code is not unique (different fabrics share value)', async () => {
    const token = await loginOwner();
    const auth = { Authorization: `Bearer ${token}` };

    const a = await request(app).post('/api/fabrics').set(auth).send({
      name_ar: 'خامة sup-A', composition: [{ material: 'قطن', percent: 100 }],
      width_cm: 150, grade: 'A', unit: 'kg', supplier_code: 'XYZ',
    });
    const b = await request(app).post('/api/fabrics').set(auth).send({
      name_ar: 'خامة sup-B', composition: [{ material: 'قطن', percent: 100 }],
      width_cm: 150, grade: 'A', unit: 'kg', supplier_code: 'XYZ',
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.supplier_code).toBe('XYZ');
    expect(b.body.supplier_code).toBe('XYZ');
  });
});
