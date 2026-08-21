// Final-payment discount — the cashier may waive part of the remaining balance
// when settling an open invoice. Recorded on invoices.final_discount_egp.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { app } from '../../src/server.js';
import { FinalPaymentSchema } from '../../src/domain/sales/sales.schemas.js';

const serviceSrc = readFileSync(
  new URL('../../src/domain/sales/openInvoices.service.ts', import.meta.url),
  'utf8',
);

describe('final payment discount', () => {
  it('contract — POST /api/invoices/:id/payments/final still requires auth', async () => {
    const res = await request(app).post('/api/invoices/1/payments/final').send({});
    expect(res.status).toBe(401);
  });

  it('schema accepts a discount alongside the payments', () => {
    const parsed = FinalPaymentSchema.safeParse({
      payments: [{ method: 'cash', amount: 45000 }],
      discountEgp: 482.5,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.discountEgp).toBe(482.5);
  });

  it('schema keeps the discount optional (existing callers unchanged)', () => {
    const parsed = FinalPaymentSchema.safeParse({
      payments: [{ method: 'cash', amount: 100 }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.discountEgp).toBeUndefined();
  });

  it('schema rejects a negative discount', () => {
    const parsed = FinalPaymentSchema.safeParse({
      payments: [{ method: 'cash', amount: 100 }],
      discountEgp: -1,
    });
    expect(parsed.success).toBe(false);
  });

  it('schema allows an empty payments array so a full discount can close the invoice', () => {
    const parsed = FinalPaymentSchema.safeParse({ payments: [], discountEgp: 500 });
    expect(parsed.success).toBe(true);
  });

  it('service compares the tendered amount against balance minus discount', () => {
    expect(serviceSrc).toMatch(/const required = roundEgp\(balance - discount\)/);
    expect(serviceSrc).toMatch(/paidNow \+ EPS < required/);
    expect(serviceSrc).toMatch(/paidNow > required \+ EPS/);
  });

  it('service rejects a discount larger than the balance and still needs money or a discount', () => {
    expect(serviceSrc).toMatch(/DISCOUNT_EXCEEDS_BALANCE/);
    expect(serviceSrc).toMatch(/paidNow <= 0 && discount <= 0.*\n?.*NO_PAYMENT_PROVIDED/);
  });

  it('service lowers total_egp and accumulates final_discount_egp', () => {
    expect(serviceSrc).toMatch(/newTotal = roundEgp\(Number\(invoice\.total_egp\) - discount\)/);
    expect(serviceSrc).toMatch(
      /newFinalDiscount = roundEgp\(Number\(invoice\.final_discount_egp\) \+ discount\)/,
    );
    expect(serviceSrc).toMatch(/newBalance = roundEgp\(newTotal - newPaid\)/);
    expect(serviceSrc).toMatch(/final_discount_egp: newFinalDiscount/);
  });

  it('service posts the waived amount to the customer ledger as an adjustment', () => {
    expect(serviceSrc).toMatch(/entry_type: 'adjustment'/);
    expect(serviceSrc).toMatch(/خصم عند الدفعة النهائية/);
  });

  it('service audits the applied discount', () => {
    expect(serviceSrc).toMatch(/discount_applied_egp: discount/);
  });

  it('controller maps the discount errors to Arabic messages', () => {
    const ctl = readFileSync(
      new URL('../../src/domain/sales/sales.controller.ts', import.meta.url),
      'utf8',
    );
    expect(ctl).toMatch(/DISCOUNT_EXCEEDS_BALANCE: \{ status: 400/);
    expect(ctl).toMatch(/INVALID_DISCOUNT: \{ status: 400/);
    expect(ctl).toMatch(/data\.discountEgp \?\? 0/);
  });

  it('reports fold the payment-time discount into the invoice discount totals', () => {
    for (const p of [
      '../../src/domain/reports/dailyReportService.ts',
      '../../src/domain/shifts/shiftReportService.ts',
    ]) {
      const src = readFileSync(new URL(p, import.meta.url), 'utf8');
      expect(src, p).toMatch(/SUM\(cart_discount_egp \+ final_discount_egp\)/);
      expect(src, p).toMatch(/i\.cart_discount_egp \+ i\.final_discount_egp/);
    }
  });
});
