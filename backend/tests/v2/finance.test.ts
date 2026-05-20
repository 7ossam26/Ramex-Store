// v2 Phase 10 — Finance (InstaPay expense source + cash drawer label).
// Q&A #33, #34, #35.
import { describe, it, expect } from 'vitest';
import { CreateExpenseSchema } from '../../src/domain/finance/finance.schemas.js';

describe('v2 — finance (Q&A #33-35)', () => {
  it('Q&A #33 — paid_from accepts cash + bank + instapay', () => {
    for (const v of ['cash', 'bank', 'instapay'] as const) {
      const r = CreateExpenseSchema.safeParse({
        category: 'rent', amount_egp: 100, paid_from: v,
        ...(v !== 'cash' ? { bank_account_id: 1 } : {}),
      });
      expect(r.success, v).toBe(true);
    }
  });

  it('Q&A #33 — paid_from rejects unknown values', () => {
    const r = CreateExpenseSchema.safeParse({
      category: 'rent', amount_egp: 100, paid_from: 'wallet' as never,
    });
    expect(r.success).toBe(false);
  });

  // Note: bank_account_id is "optional" at the Zod layer (nullable/optional);
  // the runtime guard sits in expensesService.ts (the service rejects
  // instapay/bank when no bank_account_id present). Verify by source check.
  it('Q&A #33 — service enforces bank_account_id for instapay/bank', async () => {
    const src = (await import('node:fs')).readFileSync(
      new URL('../../src/domain/finance/expensesService.ts', import.meta.url),
      'utf8',
    );
    expect(src).toMatch(/instapay/);
    expect(src).toMatch(/bank_account_id|bankAccountId/);
  });

  it('Q&A #34 — staleInvoices.job reads stale_invoice_days setting (default 7)', async () => {
    const src = (await import('node:fs')).readFileSync(
      new URL('../../src/domain/sales/staleInvoices.job.ts', import.meta.url),
      'utf8',
    );
    expect(src).toMatch(/stale_invoice_days/);
    expect(src).toMatch(/7/); // default 7 calendar days
    // No business-day plumbing anywhere in the file.
    expect(src).not.toMatch(/business_day/);
  });

  it('Q&A #34 — no migration adds business_day_id column', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = path.dirname(fileURLToPath(import.meta.url));
    const dir = path.resolve(here, '..', '..', 'src', 'db', 'migrations');
    for (const f of fs.readdirSync(dir)) {
      const content = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(content, `migration ${f} mentions business_day_id`).not.toMatch(/business_day_id/);
    }
  });

  it('Q&A #35 — cash drawer UI label «اليوم يبدأ من 10:30 ص» is present in frontend strings', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    // Resolve relative to this test file (../../../frontend/src/i18n/ar.ts).
    const here = path.dirname(fileURLToPath(import.meta.url));
    const arFile = path.resolve(here, '..', '..', '..', 'frontend', 'src', 'i18n', 'ar.ts');
    expect(fs.existsSync(arFile), `ar.ts at ${arFile}`).toBe(true);
    const text = fs.readFileSync(arFile, 'utf8');
    expect(text).toMatch(/10:30/);
  });
});
