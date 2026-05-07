import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';

const RUN_DB = process.env.RUN_DB_TESTS === '1';

describe('items API', () => {
  it('GET /api/fabrics requires auth', async () => {
    const res = await request(app).get('/api/fabrics');
    expect(res.status).toBe(401);
  });

  it('GET /api/colors requires auth', async () => {
    const res = await request(app).get('/api/colors');
    expect(res.status).toBe(401);
  });

  it('GET /api/fabric-color-prices requires auth', async () => {
    const res = await request(app).get('/api/fabric-color-prices');
    expect(res.status).toBe(401);
  });

  it('GET /api/rolls requires auth', async () => {
    const res = await request(app).get('/api/rolls');
    expect(res.status).toBe(401);
  });

  it.skipIf(!RUN_DB)('POST /api/fabrics returns 403 for non-owner', async () => {
    // Login as shop_seller first — requires a seller user in the DB
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'seller', password: 'ChangeMe123!' });
    const token = loginRes.body.token;

    const res = await request(app)
      .post('/api/fabrics')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: 'X', name_ar: 'test', composition: [{ material: 'قطن', percent: 100 }], width_cm: 100, grade: '1K' });
    expect(res.status).toBe(403);
  });

  it.skipIf(!RUN_DB)('Owner can create fabric → color → price → roll with auto-barcode', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'owner', password: 'ChangeMe123!' });
    const token = loginRes.body.token;
    const auth = { Authorization: `Bearer ${token}` };

    const fabric = await request(app).post('/api/fabrics').set(auth).send({
      code: `TEST-${Date.now()}`,
      name_ar: 'خامة اختبار',
      composition: [{ material: 'بوليستر', percent: 100 }],
      width_cm: 120,
      grade: '2K',
    });
    expect(fabric.status).toBe(201);
    expect(fabric.body.id).toBeDefined();

    const color = await request(app).post('/api/colors').set(auth).send({
      name_ar: 'أزرق',
      code: `BLU-${Date.now()}`,
    });
    expect(color.status).toBe(201);

    await request(app).post('/api/fabric-color-prices').set(auth).send({
      fabric_id: fabric.body.id,
      color_id: color.body.id,
      default_price_per_kg: 99.50,
    });

    const roll = await request(app).post('/api/rolls').set(auth).send({
      fabric_id: fabric.body.id,
      color_id: color.body.id,
      weight_kg: 12.500,
      warehouse: 'shop',
    });
    expect(roll.status).toBe(201);
    expect(roll.body.internal_barcode).toMatch(/^RMX-R-\d{6}$/);
    expect(Number(roll.body.selling_price_egp)).toBe(99.50);

    const byBarcode = await request(app)
      .get(`/api/rolls/by-barcode/${roll.body.internal_barcode}`)
      .set(auth);
    expect(byBarcode.status).toBe(200);
    expect(byBarcode.body.id).toBe(roll.body.id);
  });
});
