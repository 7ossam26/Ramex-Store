// Final-payment discount — the cashier may waive part of the remaining balance
// when settling an open invoice. Recorded on invoices.final_discount_egp.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { app } from '../../src/server.js';
import { db } from '../../src/db/connection.js';
import { FinalPaymentSchema } from '../../src/domain/sales/sales.schemas.js';
import { createFabric } from '../../src/domain/items/fabrics.service.js';
import { createColor } from '../../src/domain/items/colors.service.js';
import { createTopBatch } from '../../src/domain/items/tops.service.js';
import { create as createCustomerRecord } from '../../src/domain/customers/customersService.js';
import { createSale } from '../../src/domain/sales/invoices.service.js';
import { addFinalPayment } from '../../src/domain/sales/openInvoices.service.js';

const serviceSrc = readFileSync(
  new URL('../../src/domain/sales/openInvoices.service.ts', import.meta.url),
  'utf8',
);

const RUN_DB = process.env.RUN_DB_TESTS === '1';

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

// Requirement #3 — the cashier enters the amount actually paid; the discount
// is the derived difference, persisted through the existing discountEgp/
// final_discount_egp mechanism (no second discount field/column).
describe.skipIf(!RUN_DB).sequential('final payment — paid amount → derived discount (DB)', () => {
  let actorUserId: number;
  let sequence = 0;

  function stamp(): string {
    sequence += 1;
    return `${Date.now()}-${sequence}`;
  }

  async function createCustomer(): Promise<number> {
    const serial = String(Date.now()).slice(-6) + String(sequence).padStart(2, '0');
    const customer = await createCustomerRecord(actorUserId, {
      name_ar: `عميل خصم ${stamp()}`,
      phone: `010${serial}`,
    });
    return Number(customer.id);
  }

  /** Opens an invoice with `total` due and only `deposit` paid up front, leaving `total - deposit` as balance. */
  async function openInvoiceWithBalance(total: number, deposit: number) {
    const id = stamp();
    const fabric = await createFabric({ name_ar: `قماش خصم ${id}`, width_cm: 150, grade: 'A', unit: 'kg' });
    const color = await createColor({ name_ar: `لون خصم ${id}` });
    const batch = await createTopBatch(
      { fabric: { id: Number(fabric.id) }, rolls: [{ color: { id: Number(color.id) }, weight_kg: 10, width_cm: 150 }] },
      actorUserId,
    );
    const rollId = Number(batch.rolls[0].id);
    const customerId = await createCustomer();
    const invoice = await createSale(
      actorUserId,
      {
        customerId,
        fulfillmentDestination: 'factory_direct',
        lines: [{ rollId, finalPricePerUnit: total / 10 }],
        payments: deposit > 0 ? [{ method: 'cash', amount: deposit }] : [],
      },
      null,
    );
    return { invoiceId: Number(invoice.id), customerId };
  }

  beforeAll(async () => {
    const actor = await db('users').whereIn('role', ['owner', 'super_admin']).orderBy('id').first('id');
    if (!actor) throw new Error('TEST_ACTOR_NOT_FOUND');
    actorUserId = Number(actor.id);
  });

  afterAll(async () => {
    if (RUN_DB) await db.destroy();
  });

  it('paid amount equals the full balance → discount is 0', async () => {
    const { invoiceId } = await openInvoiceWithBalance(1000, 0);
    const result = await addFinalPayment(invoiceId, actorUserId, [{ method: 'cash', amount: 1000 }], null, 0);
    expect(result.invoice.status).toBe('closed_pending_pickup');
    expect(Number(result.invoice.final_discount_egp)).toBe(0);
    expect(Number(result.invoice.total_egp)).toBe(1000);
    expect(Number(result.invoice.balance_egp)).toBe(0);
  });

  it('paid amount less than the balance → the difference is persisted as final_discount_egp', async () => {
    // total 10,000, paid 9,500 → discount 500, matching the worked example
    // in the requirements.
    const { invoiceId } = await openInvoiceWithBalance(10000, 0);
    const result = await addFinalPayment(invoiceId, actorUserId, [{ method: 'cash', amount: 9500 }], null, 500);
    expect(result.invoice.status).toBe('closed_pending_pickup');
    expect(Number(result.invoice.final_discount_egp)).toBe(500);
    expect(Number(result.invoice.total_egp)).toBe(9500);
    expect(Number(result.invoice.paid_egp)).toBe(9500);
    expect(Number(result.invoice.balance_egp)).toBe(0);

    const payments = await db('payments').where({ invoice_id: invoiceId, payment_kind: 'final' });
    expect(payments).toHaveLength(1);
    expect(Number(payments[0]!.amount_egp)).toBe(9500);
  });

  it('a negative discount is rejected', async () => {
    const { invoiceId } = await openInvoiceWithBalance(1000, 0);
    await expect(
      addFinalPayment(invoiceId, actorUserId, [{ method: 'cash', amount: 1000 }], null, -1),
    ).rejects.toThrow('INVALID_DISCOUNT');
  });

  it('an amount tendered beyond the balance (after any discount) is rejected as overpayment', async () => {
    const { invoiceId } = await openInvoiceWithBalance(1000, 0);
    await expect(
      addFinalPayment(invoiceId, actorUserId, [{ method: 'cash', amount: 1500 }], null, 0),
    ).rejects.toThrow('OVERPAYMENT_NOT_ALLOWED');
  });

  it('the customer statement reflects the discount as a balance-neutral adjustment (no leftover owed)', async () => {
    // A brand-new customer starts at a 0 balance. The sale posts -2000; once
    // the final payment (1800 cash + 200 discount) settles it in full, the
    // balance must return to exactly 0 — the discount must not leave the
    // customer looking like they still owe (or are owed) anything.
    const { invoiceId, customerId } = await openInvoiceWithBalance(2000, 0);
    await addFinalPayment(invoiceId, actorUserId, [{ method: 'cash', amount: 1800 }], null, 200);
    const balanceAfter = Number((await db('customers').where({ id: customerId }).first()).current_balance_egp);
    expect(balanceAfter).toBe(0);
  });
});
