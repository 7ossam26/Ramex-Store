// Regression: three secondary reports referenced columns that do not exist
// (reconciliations.performed_by_user_id, expenses.created_by_user_id / expenses.status,
// invoices.is_stale) and returned HTTP 500. They must run against the real schema.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/connection.js';
import { getBankReconciliation } from '../src/domain/reports/secondaryReports/bankReconciliation.js';
import { getExpenses } from '../src/domain/reports/secondaryReports/expenses.js';
import { getOutstandingOpenInvoices } from '../src/domain/reports/secondaryReports/outstandingOpenInvoices.js';

const RUN_DB = process.env.RUN_DB_TESTS === '1';
const FROM = '2000-01-01';
const TO = '2100-01-01';
let reconciliationId: number | null = null;

describe.skipIf(!RUN_DB).sequential('secondary reports run against the real schema', () => {
  beforeAll(async () => {
    const actor = await db('users').whereIn('role', ['owner', 'super_admin']).orderBy('id').first('id');
    const bank = await db('bank_accounts').orderBy('id').first('id');
    if (actor && bank) {
      const [{ id }] = await db('reconciliations').insert({
        recon_date: '2026-11-01', type: 'bank', bank_account_id: bank.id,
        expected_balance_egp: 100, actual_balance_egp: 90, variance_egp: -10,
        notes_ar: 'اختبار تقرير', actor_user_id: actor.id,
      }).returning('id');
      reconciliationId = Number(id);
    }
  });

  afterAll(async () => {
    if (!RUN_DB) return;
    if (reconciliationId) await db('reconciliations').where({ id: reconciliationId }).delete();
    await db.destroy();
  });

  it('bank reconciliation: joins the reconciling user via actor_user_id', async () => {
    const rows = await getBankReconciliation(FROM, TO);
    if (reconciliationId) {
      const row = rows.find((r) => r.reconciliation_id === reconciliationId)!;
      expect(row).toBeDefined();
      expect(row.performed_by).not.toBe('—');
      expect(row.variance_egp).toBe('-10.00');
    }
  });

  it('expenses: recorder via actor_user_id and an Arabic status derived from approval', async () => {
    const result = await getExpenses(FROM, TO);
    for (const r of result.rows) expect(['معتمد', 'بانتظار الموافقة', 'مسجّل']).toContain(r.status);
    expect(Number(result.grand_total_egp)).toBeGreaterThanOrEqual(0);
  });

  it('outstanding open invoices: staleness computed from the stale_invoice_days setting', async () => {
    const rows = await getOutstandingOpenInvoices();
    for (const r of rows) {
      expect(typeof r.is_stale).toBe('boolean');
      expect(r.age_days).toBeGreaterThanOrEqual(0);
    }
  });
});
