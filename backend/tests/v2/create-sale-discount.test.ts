// Payment-time discount at sale creation — the cashier may pay less than the
// invoice total in one step, waiving the shortfall via the same
// invoices.final_discount_egp mechanism addFinalPayment uses for settling an
// already-open invoice later.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { app } from '../../src/server.js';
import { db } from '../../src/db/connection.js';
import { CreateSaleSchema } from '../../src/domain/sales/sales.schemas.js';
import { createFabric } from '../../src/domain/items/fabrics.service.js';
import { createColor } from '../../src/domain/items/colors.service.js';
import { createTopBatch } from '../../src/domain/items/tops.service.js';
import { create as createCustomerRecord } from '../../src/domain/customers/customersService.js';
import { createSale } from '../../src/domain/sales/invoices.service.js';

const serviceSrc = readFileSync(
  new URL('../../src/domain/sales/invoices.service.ts', import.meta.url),
  'utf8',
);

const RUN_DB = process.env.RUN_DB_TESTS === '1';

describe('create-sale discount', () => {
  it('contract — POST /api/sales still requires auth', async () => {
    const res = await request(app).post('/api/sales').send({});
    expect(res.status).toBe(401);
  });

  it('schema accepts a discount alongside the payments', () => {
    const parsed = CreateSaleSchema.safeParse({
      customerId: 1,
      lines: [{ rollId: 1, finalPricePerUnit: 100 }],
      payments: [{ method: 'cash', amount: 50 }],
      discountEgp: 50,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.discountEgp).toBe(50);
  });

  it('schema keeps the discount optional (existing callers unchanged)', () => {
    const parsed = CreateSaleSchema.safeParse({
      customerId: 1,
      lines: [{ rollId: 1, finalPricePerUnit: 100 }],
      payments: [{ method: 'cash', amount: 100 }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.discountEgp).toBeUndefined();
  });

  it('schema rejects a negative discount', () => {
    const parsed = CreateSaleSchema.safeParse({
      customerId: 1,
      lines: [{ rollId: 1, finalPricePerUnit: 100 }],
      payments: [{ method: 'cash', amount: 100 }],
      discountEgp: -1,
    });
    expect(parsed.success).toBe(false);
  });

  it('service compares the paid amount against total minus discount', () => {
    expect(serviceSrc).toMatch(/const required = roundEgp\(totals\.total - discountEgp\)/);
    expect(serviceSrc).toMatch(/paidTotal \+ 0\.001 < required/);
    expect(serviceSrc).toMatch(/paidTotal > required \+ 0\.001/);
  });

  it('service rejects a discount larger than the total', () => {
    expect(serviceSrc).toMatch(/DISCOUNT_EXCEEDS_TOTAL/);
  });

  it('service stores the net total and the discount on final_discount_egp', () => {
    expect(serviceSrc).toMatch(
      /totals\.total = roundEgp\(totals\.total - discountEgp\)/,
    );
    expect(serviceSrc).toMatch(/final_discount_egp: discountEgp/);
  });

  it('service posts the waived amount to the customer ledger as an adjustment', () => {
    expect(serviceSrc).toMatch(/entry_type: 'adjustment'/);
    expect(serviceSrc).toMatch(/خصم عند إتمام فاتورة/);
  });

  it('service keeps the lifetime-volume bump and sale ledger entry on the pre-discount (gross) total', () => {
    expect(serviceSrc).toMatch(/const grossTotal = totals\.total/);
    expect(serviceSrc).toMatch(/lifetime_volume_egp\) \+ grossTotal/);
    expect(serviceSrc).toMatch(/amount_egp: -grossTotal/);
  });

  it('controller maps the new discount errors to Arabic messages', () => {
    const ctl = readFileSync(
      new URL('../../src/domain/sales/sales.controller.ts', import.meta.url),
      'utf8',
    );
    expect(ctl).toMatch(/DISCOUNT_EXCEEDS_TOTAL: \{ status: 400/);
    expect(ctl).toMatch(/DISCOUNT_PAYMENT_BELOW_REQUIRED: \{ status: 400/);
  });

  it('reports fold the payment-time discount into the invoice discount totals (unchanged)', () => {
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

describe.skipIf(!RUN_DB).sequential('create sale — payment + discount → net total (DB)', () => {
  let actorUserId: number;
  let sequence = 0;

  function stamp(): string {
    sequence += 1;
    return `${Date.now()}-${sequence}`;
  }

  async function createCustomer(): Promise<number> {
    const serial = String(Date.now()).slice(-6) + String(sequence).padStart(2, '0');
    const customer = await createCustomerRecord(actorUserId, {
      name_ar: `عميل خصم بيع ${stamp()}`,
      phone: `011${serial}`,
    });
    return Number(customer.id);
  }

  /** Creates a sale for `total` EGP (single roll, priced to land exactly on total), paying `paid` and waiving `discount`. */
  async function createSaleWithDiscount(total: number, paid: number, discount: number) {
    const id = stamp();
    const fabric = await createFabric({ name_ar: `قماش خصم بيع ${id}`, width_cm: 150, grade: 'A', unit: 'kg' });
    const color = await createColor({ name_ar: `لون خصم بيع ${id}` });
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
        payments: paid > 0 ? [{ method: 'cash', amount: paid }] : [],
        discountEgp: discount,
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

  it('total 5050, payment 5050, discount 0 → no discount, fully completed', async () => {
    const { invoiceId } = await createSaleWithDiscount(5050, 5050, 0);
    const invoice = await db('invoices').where({ id: invoiceId }).first();
    expect(invoice.status).toBe('completed');
    expect(Number(invoice.final_discount_egp)).toBe(0);
    expect(Number(invoice.total_egp)).toBe(5050);
    expect(Number(invoice.paid_egp)).toBe(5050);
    expect(Number(invoice.balance_egp)).toBe(0);
  });

  it('total 5050, payment 5000, discount 50 → matches the worked example', async () => {
    const { invoiceId } = await createSaleWithDiscount(5050, 5000, 50);
    const invoice = await db('invoices').where({ id: invoiceId }).first();
    expect(invoice.status).toBe('completed');
    expect(Number(invoice.final_discount_egp)).toBe(50);
    expect(Number(invoice.total_egp)).toBe(5000);
    expect(Number(invoice.paid_egp)).toBe(5000);
    expect(Number(invoice.balance_egp)).toBe(0);

    const payments = await db('payments').where({ invoice_id: invoiceId });
    expect(payments).toHaveLength(1);
    expect(Number(payments[0]!.amount_egp)).toBe(5000);
  });

  it('total 5050, payment 4000, discount 1050', async () => {
    const { invoiceId } = await createSaleWithDiscount(5050, 4000, 1050);
    const invoice = await db('invoices').where({ id: invoiceId }).first();
    expect(invoice.status).toBe('completed');
    expect(Number(invoice.final_discount_egp)).toBe(1050);
    expect(Number(invoice.total_egp)).toBe(4000);
    expect(Number(invoice.balance_egp)).toBe(0);
  });

  it('payment + discount greater than total is rejected as overpayment', async () => {
    await expect(createSaleWithDiscount(5050, 5050, 50)).rejects.toThrow('OVERPAYMENT_NOT_ALLOWED');
  });

  it('a negative discount is rejected', async () => {
    await expect(createSaleWithDiscount(1000, 1000, -1)).rejects.toThrow('INVALID_DISCOUNT');
  });

  it('the customer ledger nets to a 0 balance change after a discounted sale', async () => {
    const { invoiceId, customerId } = await createSaleWithDiscount(2000, 1800, 200);
    void invoiceId;
    const balanceAfter = Number((await db('customers').where({ id: customerId }).first()).current_balance_egp);
    expect(balanceAfter).toBe(0);
  });

  it('lifetime_volume_egp reflects the pre-discount (gross) total, matching addFinalPayment', async () => {
    const { customerId } = await createSaleWithDiscount(3000, 2500, 500);
    const customer = await db('customers').where({ id: customerId }).first();
    expect(Number(customer.lifetime_volume_egp)).toBe(3000);
  });
});
