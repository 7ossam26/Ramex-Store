// v2 Phase 10 — Payment methods (bank transfer + cheque).
// Q&A #29, #30, #31, #32.
import { describe, it, expect } from 'vitest';
import { SalePaymentSchema, ChequeDetailsSchema } from '../../src/domain/sales/sales.schemas.js';

describe('v2 — payment methods (Q&A #29-31)', () => {
  it('Q&A #29 — SalePaymentSchema accepts all four methods', () => {
    expect(SalePaymentSchema.safeParse({ method: 'cash', amount: 100 }).success).toBe(true);
    expect(SalePaymentSchema.safeParse({ method: 'instapay', amount: 100, bankAccountId: 1 }).success).toBe(true);
    expect(SalePaymentSchema.safeParse({ method: 'bank_transfer', amount: 100, bankAccountId: 1 }).success).toBe(true);
    expect(SalePaymentSchema.safeParse({
      method: 'cheque', amount: 100,
      chequeDetails: {
        chequeNumber: 'C', bankNameAr: 'بنك',
        issueDate: '2026-05-01', dueDate: '2026-06-01',
      },
    }).success).toBe(true);
  });

  it('Q&A #29 — bank_transfer without bank_account_id is rejected', () => {
    const r = SalePaymentSchema.safeParse({ method: 'bank_transfer', amount: 100 });
    expect(r.success).toBe(false);
  });

  it('Q&A #29 — cheque without chequeDetails is rejected', () => {
    const r = SalePaymentSchema.safeParse({ method: 'cheque', amount: 100 });
    expect(r.success).toBe(false);
  });

  it('Q&A #29 — cheque with due_date < issue_date rejected', () => {
    const r = ChequeDetailsSchema.safeParse({
      chequeNumber: 'C', bankNameAr: 'بنك',
      issueDate: '2026-06-01', dueDate: '2026-05-01', // past due
    });
    expect(r.success).toBe(false);
  });

  it('Q&A #30 — cheque with past due_date (but >= issue_date) is accepted', () => {
    const r = ChequeDetailsSchema.safeParse({
      chequeNumber: 'C', bankNameAr: 'بنك',
      issueDate: '2020-01-01', dueDate: '2020-02-01', // both in the past
    });
    expect(r.success).toBe(true);
  });

  it('Q&A #31 — invoice PDF builder does NOT include cheque-detail fields', async () => {
    const src = (await import('node:fs')).readFileSync(
      new URL('../../src/lib/pdf/invoice.ts', import.meta.url),
      'utf8',
    );
    // Receipt must show generic «شيك» but never the cheque number/bank/due date.
    expect(src).not.toMatch(/cheque_number|chequeNumber/);
    expect(src).not.toMatch(/due_date|dueDate/);
    expect(src).not.toMatch(/issuer_name|issuerName/);
  });

  it('Q&A #29 — cheques FK to payments uses ON DELETE CASCADE (schema confirms)', async () => {
    const mig = (await import('node:fs')).readFileSync(
      new URL('../../src/db/migrations/050_v2_phase_7_payment_methods.ts', import.meta.url),
      'utf8',
    );
    expect(mig).toMatch(/onDelete\('CASCADE'\)/);
  });
});
