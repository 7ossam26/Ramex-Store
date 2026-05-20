// v2 Phase 10 — POS final per-unit price + refundable open-invoice deposit.
// Q&A #21, #22, #23, #24.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { CreateSaleSchema, DepositRefundSchema, AddLinesSchema } from '../../src/domain/sales/sales.schemas.js';

describe('v2 — POS pricing + deposit (Q&A #21-24)', () => {
  it('contract — POST /api/sales requires auth', async () => {
    const res = await request(app).post('/api/sales').send({});
    expect(res.status).toBe(401);
  });

  it('contract — POST /api/invoices/:id/deposit-refund requires auth', async () => {
    const res = await request(app).post('/api/invoices/1/deposit-refund').send({});
    expect(res.status).toBe(401);
  });

  it('Q&A #21 — SaleLineSchema carries finalPricePerUnit per cashier override', () => {
    const parsed = CreateSaleSchema.safeParse({
      customerId: 1,
      lines: [{ rollId: 1, finalPricePerUnit: 100 }],
      payments: [{ method: 'cash', amount: 100 }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.lines[0].finalPricePerUnit).toBe(100);
  });

  it('Q&A #22 — Open invoice can be created with empty lines (deposit-only)', () => {
    const parsed = CreateSaleSchema.safeParse({
      customerId: 1,
      lines: [],
      payments: [{ method: 'cash', amount: 500 }],
    });
    expect(parsed.success).toBe(true);
  });

  it('Q&A #22 — AddLinesSchema accepts adding lines to an existing open invoice', () => {
    const parsed = AddLinesSchema.safeParse({
      lines: [{ rollId: 1, finalPricePerUnit: 300 }],
    });
    expect(parsed.success).toBe(true);
  });

  it('Q&A #23/#24 — DepositRefundSchema accepts cash + instapay + bank_transfer + cheque', () => {
    for (const method of ['cash', 'instapay', 'bank_transfer', 'cheque'] as const) {
      const base = { amountEgp: 200, method } as Record<string, unknown>;
      if (method === 'instapay' || method === 'bank_transfer') base.bankAccountId = 1;
      if (method === 'cheque') {
        base.chequeDetails = {
          chequeNumber: 'C1', bankNameAr: 'بنك', issueDate: '2026-05-01', dueDate: '2026-06-01',
        };
      }
      const parsed = DepositRefundSchema.safeParse(base);
      expect(parsed.success, `method ${method}`).toBe(true);
    }
  });

  it('Q&A #24 — DepositRefundSchema requires bankAccountId for instapay/bank_transfer', () => {
    const a = DepositRefundSchema.safeParse({ amountEgp: 100, method: 'instapay' });
    expect(a.success).toBe(false);
    const b = DepositRefundSchema.safeParse({ amountEgp: 100, method: 'bank_transfer' });
    expect(b.success).toBe(false);
  });

  it('Q&A #24 — error map registers deposit_refunded-related guards', async () => {
    const ctrlSrc = (await import('node:fs')).readFileSync(
      new URL('../../src/domain/sales/sales.controller.ts', import.meta.url),
      'utf8',
    );
    expect(ctrlSrc).toContain('REFUND_EXCEEDS_OVER_DEPOSIT');
    expect(ctrlSrc).toContain('NO_OVER_DEPOSIT');
  });
});
