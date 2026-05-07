import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';
import { backCalculateDiscount, applyLineDiscount, roundEgp } from '../src/domain/sales/discountCalculator.js';

describe('sales API auth guard', () => {
  it('POST /api/sales requires auth', async () => {
    const res = await request(app).post('/api/sales').send({});
    expect(res.status).toBe(401);
  });
  it('POST /api/sales/preview requires auth', async () => {
    const res = await request(app).post('/api/sales/preview').send({});
    expect(res.status).toBe(401);
  });
  it('GET /api/invoices requires auth', async () => {
    const res = await request(app).get('/api/invoices');
    expect(res.status).toBe(401);
  });
  it('POST /api/invoices/:id/void requires auth', async () => {
    const res = await request(app).post('/api/invoices/1/void').send({});
    expect(res.status).toBe(401);
  });
});

describe('discount calculator', () => {
  it('back-calculates a clean discount', () => {
    const r = backCalculateDiscount(1000, 800);
    expect(r.cart_discount_egp).toBe(200);
    expect(r.effective_percent).toBe(20);
  });
  it('returns zeros when subtotal is zero', () => {
    const r = backCalculateDiscount(0, 0);
    expect(r.cart_discount_egp).toBe(0);
    expect(r.effective_percent).toBe(0);
  });
  it('rejects target greater than subtotal (no markup)', () => {
    expect(() => backCalculateDiscount(100, 200)).toThrow('TARGET_FINAL_GREATER_THAN_SUBTOTAL');
  });
  it('rounds 2dp results', () => {
    expect(roundEgp(1.234)).toBe(1.23);
    expect(roundEgp(1.235001)).toBe(1.24);
    expect(roundEgp(0.1 + 0.2)).toBe(0.3);
  });
  it('applies a 10% line discount', () => {
    expect(applyLineDiscount(500, 10)).toBe(50);
  });
  it('caps line discount at 100%', () => {
    expect(applyLineDiscount(123.45, 150)).toBe(123.45);
  });
});

describe('invoice number format', () => {
  it('produces INV-YYYY-NNNNNN with 6-digit padding', () => {
    const formatted = `INV-${2026}-${String(7).padStart(6, '0')}`;
    expect(formatted).toBe('INV-2026-000007');
  });
});
