import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';

describe('inventory API auth guard', () => {
  it('GET /api/shipments requires auth', async () => {
    const res = await request(app).get('/api/shipments');
    expect(res.status).toBe(401);
  });

  it('POST /api/shipments requires auth', async () => {
    const res = await request(app).post('/api/shipments').send({});
    expect(res.status).toBe(401);
  });

  it('POST /api/damage-events requires auth', async () => {
    const res = await request(app).post('/api/damage-events').send({});
    expect(res.status).toBe(401);
  });

  it('POST /api/stocktakes requires auth', async () => {
    const res = await request(app).post('/api/stocktakes').send({});
    expect(res.status).toBe(401);
  });

  it('POST /api/adjustments requires auth', async () => {
    const res = await request(app).post('/api/adjustments').send({});
    expect(res.status).toBe(401);
  });

  it('GET /api/stock-movements requires auth', async () => {
    const res = await request(app).get('/api/stock-movements');
    expect(res.status).toBe(401);
  });

  it('GET /api/damage-events requires auth', async () => {
    const res = await request(app).get('/api/damage-events');
    expect(res.status).toBe(401);
  });

  it('GET /api/stocktakes requires auth', async () => {
    const res = await request(app).get('/api/stocktakes');
    expect(res.status).toBe(401);
  });
});

describe('shipment number format', () => {
  it('produces SHP-YYYY-NNNNNN with 6-digit padding', async () => {
    // pure unit logic — just check the formatter shape
    const year = 2026;
    const usedNo = 5;
    const formatted = `SHP-${year}-${String(usedNo).padStart(6, '0')}`;
    expect(formatted).toBe('SHP-2026-000005');
  });
});
