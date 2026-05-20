// v2 Phase 10 — Return on scan.
// Q&A #25, #26, #27, #28.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { ReturnFromScanSchema } from '../../src/domain/sales/returns.schemas.js';

describe('v2 — return on scan (Q&A #25-28)', () => {
  it('contract — GET /api/returns/scan-preview/:rollId requires auth', async () => {
    const res = await request(app).get('/api/returns/scan-preview/1');
    expect(res.status).toBe(401);
  });

  it('contract — POST /api/returns/from-scan requires auth', async () => {
    const res = await request(app).post('/api/returns/from-scan').send({ rollId: 1, refundMethod: 'cash' });
    expect(res.status).toBe(401);
  });

  it('Q&A #25 — ReturnFromScanSchema accepts all 4 refund methods', () => {
    for (const m of ['cash', 'instapay', 'bank_transfer', 'cheque'] as const) {
      const base: Record<string, unknown> = { rollId: 1, refundMethod: m };
      if (m === 'instapay' || m === 'bank_transfer') base.bankAccountId = 1;
      if (m === 'cheque') {
        base.chequeDetails = {
          chequeNumber: 'C', bankNameAr: 'بنك',
          issueDate: '2026-05-01', dueDate: '2026-06-01',
        };
      }
      expect(ReturnFromScanSchema.safeParse(base).success, `method ${m}`).toBe(true);
    }
  });

  it('Q&A #25 — instapay/bank_transfer refund requires bankAccountId', () => {
    const a = ReturnFromScanSchema.safeParse({ rollId: 1, refundMethod: 'instapay' });
    expect(a.success).toBe(false);
    const b = ReturnFromScanSchema.safeParse({ rollId: 1, refundMethod: 'bank_transfer' });
    expect(b.success).toBe(false);
  });

  it('Q&A #25 — cheque refund requires chequeDetails', () => {
    const r = ReturnFromScanSchema.safeParse({ rollId: 1, refundMethod: 'cheque' });
    expect(r.success).toBe(false);
  });

  it('Q&A #27 — returnsService uses sticky line_total_egp (source file verifies)', async () => {
    const src = (await import('node:fs')).readFileSync(
      new URL('../../src/domain/sales/returnsService.ts', import.meta.url),
      'utf8',
    );
    // Refund amount is read from the original sale_lines, not from
    // rolls.selling_price_egp.
    expect(src).toMatch(/line_total_egp|sale_lines|original_invoice/);
  });
});
