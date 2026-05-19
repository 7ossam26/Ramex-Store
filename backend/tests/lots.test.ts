import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';

const RUN_DB = process.env.RUN_DB_TESTS === '1';

describe('lots API', () => {
  it('GET /api/lots requires auth', async () => {
    const res = await request(app).get('/api/lots');
    expect(res.status).toBe(401);
  });

  it('POST /api/lots requires auth', async () => {
    const res = await request(app).post('/api/lots').send({ fabric_id: 1, color_id: 1 });
    expect(res.status).toBe(401);
  });

  it.skipIf(!RUN_DB)('Owner can create a lot — lot_no auto-assigned as LT-NNNNNN', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'owner', password: 'ChangeMe123!' });
    const token = loginRes.body.token;
    const auth = { Authorization: `Bearer ${token}` };

    const fabric = await request(app).post('/api/fabrics').set(auth).send({
      name_ar: 'خامة اختبار LOT',
      composition: [{ material: 'بوليستر', percent: 100 }],
      width_cm: 150,
      grade: 'A',
      unit: 'kg',
    });
    expect(fabric.status).toBe(201);

    const color = await request(app).post('/api/colors').set(auth).send({ name_ar: 'أحمر-LOT' });
    expect(color.status).toBe(201);

    const lot = await request(app).post('/api/lots').set(auth).send({
      fabric_id: fabric.body.id,
      color_id: color.body.id,
      notes_ar: 'دفعة اختبار',
    });
    expect(lot.status).toBe(201);
    expect(lot.body.lot_no).toMatch(/^LT-\d{6}$/);
    expect(lot.body.fabric_id).toBe(fabric.body.id);
    expect(lot.body.color_id).toBe(color.body.id);
  });

  it.skipIf(!RUN_DB)('Tops batch rejects lot with mismatched color', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'owner', password: 'ChangeMe123!' });
    const token = loginRes.body.token;
    const auth = { Authorization: `Bearer ${token}` };

    const fabric = await request(app).post('/api/fabrics').set(auth).send({
      name_ar: 'خامة-MISMATCH',
      composition: [{ material: 'قطن', percent: 100 }],
      width_cm: 140,
      grade: 'A',
      unit: 'kg',
    });
    const colorA = await request(app).post('/api/colors').set(auth).send({ name_ar: 'أزرق-A' });
    const colorB = await request(app).post('/api/colors').set(auth).send({ name_ar: 'أخضر-B' });

    const lot = await request(app).post('/api/lots').set(auth).send({
      fabric_id: fabric.body.id,
      color_id: colorA.body.id,
    });
    expect(lot.status).toBe(201);

    // Try to attach the colorA-lot to a colorB roll → should be rejected.
    const res = await request(app).post('/api/tops/batch').set(auth).send({
      fabric: { id: fabric.body.id },
      rolls: [{
        color: { id: colorB.body.id },
        weight_kg: 25,
        lot_id: lot.body.id,
      }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('lot_fabric_color_mismatch');
  });
});
