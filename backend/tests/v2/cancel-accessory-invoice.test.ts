// Regression — cancelling an invoice that contains an accessory line.
//
// Bug: `invoice_lines.roll_id` is NULL on accessory lines (migration 082), but
// cancelOpenInvoice/voidInvoice fed every line's roll_id into the roll loop and
// inserted a stock_movements row with roll_id NULL and entity_type defaulting
// to 'roll'. That violates chk_stock_movements_entity_type (migration 093), so
// Postgres raised 23514 and the whole transaction rolled back — surfaced to the
// user as «القيمة المُدخلة غير مسموح بها» on every attempt.
//
// Second defect covered here: createSale decrements accessories.qty_in_stock,
// but no cancellation path ever gave it back.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';
import { db } from '../../src/db/connection.js';

const RUN_DB = process.env.RUN_DB_TESTS === '1';
const OWNER = { username: 'owner', password: 'ChangeMe123!' };

let auth: { Authorization: string };
let seq = 0;

/** Unique Egyptian mobile per created customer — `phone` is UNIQUE. */
function uniquePhone(): string {
  seq += 1;
  return `010${String(Date.now()).slice(-6)}${String(seq).padStart(2, '0')}`;
}

async function loginOwner(): Promise<void> {
  const r = await request(app).post('/api/auth/login').send(OWNER);
  auth = { Authorization: `Bearer ${r.body.token}` };
}

/** cancel / void / final-payment all sit behind requireOpenShift. */
async function ensureOpenShift(): Promise<void> {
  const cur = await request(app).get('/api/shifts/current').set(auth);
  if (cur.body && cur.body.id) return;
  await request(app).post('/api/shifts/open').set(auth).send({ notes_ar: 'اختبار' });
}

async function createCustomer(): Promise<number> {
  const r = await request(app)
    .post('/api/customers')
    .set(auth)
    .send({ name_ar: `عميل اختبار ${seq}`, phone: uniquePhone() });
  expect([200, 201], JSON.stringify(r.body)).toContain(r.status);
  return r.body.id as number;
}

async function createAccessory(quantity: number): Promise<number> {
  seq += 1;
  const r = await request(app)
    .post('/api/accessories')
    .set(auth)
    .send({ name_ar: `اكسسوار اختبار ${Date.now()}-${seq}`, quantity, selling_price_egp: 50 });
  expect([200, 201], JSON.stringify(r.body)).toContain(r.status);
  return r.body.id as number;
}

/** Tops-batch rolls land in the factory warehouse, so sales use factory_direct. */
async function createFactoryRoll(): Promise<number> {
  seq += 1;
  const stamp = `${Date.now()}-${seq}`;
  const f = await request(app).post('/api/fabrics').set(auth).send({
    name_ar: `قماش اختبار ${stamp}`,
    composition: [{ material: 'قطن', percent: 100 }],
    width_cm: 150,
    grade: 'A',
    unit: 'kg',
  });
  expect([200, 201], JSON.stringify(f.body)).toContain(f.status);
  const c = await request(app)
    .post('/api/colors')
    .set(auth)
    .send({ name_ar: `لون اختبار ${stamp}` });
  expect([200, 201], JSON.stringify(c.body)).toContain(c.status);

  const batch = await request(app)
    .post('/api/tops/batch')
    .set(auth)
    .send({
      fabric: { id: f.body.id },
      rolls: [{ color: { id: c.body.id }, weight_kg: 10, width_cm: 150 }],
    });
  expect([200, 201], JSON.stringify(batch.body)).toContain(batch.status);
  const rolls = batch.body.rolls ?? batch.body;
  return (Array.isArray(rolls) ? rolls[0].id : rolls.id) as number;
}

async function qtyInStock(accessoryId: number): Promise<number> {
  const row = await db('accessories').where({ id: accessoryId }).first();
  return Number(row.qty_in_stock);
}

type SaleLine = Record<string, unknown>;

async function createSale(
  customerId: number,
  lines: SaleLine[],
  paidAmount: number,
  destination: 'shop' | 'factory_direct' = 'shop',
) {
  const res = await request(app)
    .post('/api/sales')
    .set(auth)
    .send({
      customerId,
      fulfillmentDestination: destination,
      lines,
      payments: paidAmount > 0 ? [{ method: 'cash', amount: paidAmount }] : [],
    });
  expect([200, 201], JSON.stringify(res.body)).toContain(res.status);
  return res.body;
}

const accLine = (accessoryId: number, qtyPieces: number, price = 50) => ({
  type: 'accessory',
  accessoryId,
  qtyPieces,
  finalPricePerPiece: price,
});

describe('cancel / void invoices containing accessory lines', () => {
  beforeAll(async () => {
    if (!RUN_DB) return;
    await loginOwner();
    await ensureOpenShift();
  });

  it.skipIf(!RUN_DB)(
    'regression — accessory-only open invoice cancels with full_refund and restores stock',
    async () => {
      const accId = await createAccessory(20);
      const before = await qtyInStock(accId);
      const customerId = await createCustomer();

      // 4 pieces × 50 = 200 total, 80 deposit → invoice stays `open`.
      const invoice = await createSale(customerId, [accLine(accId, 4)], 80);
      expect(invoice.status).toBe('open');
      expect(await qtyInStock(accId)).toBe(before - 4);

      const res = await request(app)
        .post(`/api/invoices/${invoice.id}/cancel`)
        .set(auth)
        .send({
          deposit_handling: 'full_refund',
          refund_method: 'cash',
          notes_ar: 'إلغاء اختبار',
        });

      // Before the fix this was 400 { error: 'check_violation' }.
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.invoice.status).toBe('cancelled');
      expect(await qtyInStock(accId)).toBe(before);
    },
  );

  it.skipIf(!RUN_DB)(
    'mixed roll + accessory — roll returns to stock, accessory qty restored, no accessory movement row',
    async () => {
      const accId = await createAccessory(15);
      const rollId = await createFactoryRoll();
      const before = await qtyInStock(accId);
      const customerId = await createCustomer();

      const invoice = await createSale(
        customerId,
        [{ rollId, finalPricePerUnit: 100 }, accLine(accId, 3)],
        200,
        'factory_direct',
      );
      expect(invoice.status).toBe('open');

      const res = await request(app)
        .post(`/api/invoices/${invoice.id}/cancel`)
        .set(auth)
        .send({
          deposit_handling: 'full_refund',
          refund_method: 'cash',
          notes_ar: 'إلغاء اختبار مختلط',
        });
      expect(res.status, JSON.stringify(res.body)).toBe(200);

      const roll = await db('rolls').where({ id: rollId }).first();
      expect(roll.status).toBe('in_stock');
      expect(await qtyInStock(accId)).toBe(before);

      const unreserve = await db('stock_movements')
        .where({ reference_type: 'invoice', reference_id: invoice.id, event_type: 'unreserve' })
        .select('id', 'roll_id');
      expect(unreserve).toHaveLength(1);
      expect(Number(unreserve[0].roll_id)).toBe(rollId);

      // Locks in the design decision: accessories keep no stock_movements
      // ledger — restore is qty + audit only, symmetric with the sale.
      const accMovements = await db('stock_movements')
        .where({ reference_type: 'invoice', reference_id: invoice.id })
        .whereNotNull('accessory_id');
      expect(accMovements).toHaveLength(0);
    },
  );

  it.skipIf(!RUN_DB)(
    'partial_refund — accessory stock is restored in full even though only part of the deposit returns',
    async () => {
      const accId = await createAccessory(12);
      const before = await qtyInStock(accId);
      const customerId = await createCustomer();

      const invoice = await createSale(customerId, [accLine(accId, 5)], 150);

      const res = await request(app)
        .post(`/api/invoices/${invoice.id}/cancel`)
        .set(auth)
        .send({
          deposit_handling: 'partial_refund',
          refund_method: 'cash',
          partial_refund_amount: 60,
          notes_ar: 'استرجاع جزئي',
        });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(await qtyInStock(accId)).toBe(before);

      const refunds = await db('payments')
        .where({ invoice_id: invoice.id, payment_kind: 'refund' })
        .select('amount_egp');
      expect(refunds).toHaveLength(1);
      expect(Number(refunds[0].amount_egp)).toBe(-60);
    },
  );

  it.skipIf(!RUN_DB)(
    'keep_as_credit — accessory stock is restored AND the customer keeps the deposit as credit',
    async () => {
      const accId = await createAccessory(10);
      const before = await qtyInStock(accId);
      const customerId = await createCustomer();
      const balanceBefore = Number(
        (await db('customers').where({ id: customerId }).first()).current_balance_egp,
      );

      const invoice = await createSale(customerId, [accLine(accId, 2)], 40);

      const res = await request(app)
        .post(`/api/invoices/${invoice.id}/cancel`)
        .set(auth)
        .send({ deposit_handling: 'keep_as_credit', notes_ar: 'رصيد دائن' });
      expect(res.status, JSON.stringify(res.body)).toBe(200);

      // Stock comes back regardless of how the money was handled.
      expect(await qtyInStock(accId)).toBe(before);

      const balanceAfter = Number(
        (await db('customers').where({ id: customerId }).first()).current_balance_egp,
      );
      expect(balanceAfter).toBeGreaterThan(balanceBefore);
    },
  );

  it.skipIf(!RUN_DB)('void — a completed accessory invoice can be voided and restores stock', async () => {
    const accId = await createAccessory(9);
    const before = await qtyInStock(accId);
    const customerId = await createCustomer();

    // Fully paid → createSale lands the invoice on `completed`.
    const invoice = await createSale(customerId, [accLine(accId, 3)], 150);
    expect(invoice.status).toBe('completed');

    const res = await request(app)
      .post(`/api/invoices/${invoice.id}/void`)
      .set(auth)
      .send({ reason_ar: 'إلغاء بعد الإتمام' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await qtyInStock(accId)).toBe(before);
  });

  it.skipIf(!RUN_DB)(
    'void after a partial return restores accessory stock exactly once',
    async () => {
      const accId = await createAccessory(8);
      const before = await qtyInStock(accId);
      const customerId = await createCustomer();

      const invoice = await createSale(customerId, [accLine(accId, 2)], 100);
      expect(invoice.status).toBe('completed');

      const detail = await request(app).get(`/api/invoices/${invoice.id}`).set(auth);
      const accessoryLine = detail.body.lines.find(
        (l: { item_type: string }) => l.item_type === 'accessory',
      );

      const ret = await request(app)
        .post('/api/returns')
        .set(auth)
        .send({
          originalInvoiceId: invoice.id,
          lines: [
            {
              originalLineId: accessoryLine.id,
              accessoryId: accId,
              refundAmountEgp: 100,
              disposition: 'back_to_stock',
            },
          ],
          refundMethod: 'cash',
          ownerWindowOverride: true,
          notesAr: 'مرتجع اختبار',
        });
      expect([200, 201], JSON.stringify(ret.body)).toContain(ret.status);

      // The return already credited the stock back.
      expect(await qtyInStock(accId)).toBe(before);

      const res = await request(app)
        .post(`/api/invoices/${invoice.id}/void`)
        .set(auth)
        .send({ reason_ar: 'إلغاء بعد المرتجع' });
      expect(res.status, JSON.stringify(res.body)).toBe(200);

      // Must NOT be credited a second time.
      expect(await qtyInStock(accId)).toBe(before);
    },
  );

  it.skipIf(!RUN_DB)(
    'final payment closes an accessory invoice without touching accessory stock',
    async () => {
      const accId = await createAccessory(11);
      const customerId = await createCustomer();

      const invoice = await createSale(customerId, [accLine(accId, 4)], 50);
      expect(invoice.status).toBe('open');
      const afterSale = await qtyInStock(accId);

      const res = await request(app)
        .post(`/api/invoices/${invoice.id}/payments/final`)
        .set(auth)
        .send({ payments: [{ method: 'cash', amount: 150 }] });

      // Before the fix this also raised 23514 on the sale_out movement.
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.invoice.status).toBe('closed_pending_pickup');

      // The goods are leaving — nothing to give back.
      expect(await qtyInStock(accId)).toBe(afterSale);
    },
  );

  it.skipIf(!RUN_DB)('same accessory on two lines is restored once per line', async () => {
    const accId = await createAccessory(20);
    const before = await qtyInStock(accId);
    const customerId = await createCustomer();

    const invoice = await createSale(customerId, [accLine(accId, 3), accLine(accId, 2)], 100);
    expect(await qtyInStock(accId)).toBe(before - 5);

    const res = await request(app)
      .post(`/api/invoices/${invoice.id}/cancel`)
      .set(auth)
      .send({ deposit_handling: 'keep_as_credit', notes_ar: 'سطران لنفس الصنف' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await qtyInStock(accId)).toBe(before);

    const audits = await db('audit_log')
      .where({ entity: 'accessory', action: 'cancel_restore_accessory', entity_id: String(accId) })
      .orderBy('id', 'desc')
      .limit(2);
    expect(audits).toHaveLength(2);
  });

  // Source guard — runs without a database.
  it('the NULL-roll_id loop is gone from both cancel paths', async () => {
    const { readFileSync } = await import('node:fs');
    const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

    const openSrc = read('../../src/domain/sales/openInvoices.service.ts');
    // The helper was renamed so every call site had to be revisited.
    expect(openSrc).not.toContain('lockInvoiceWithLineRolls');
    expect(openSrc).toContain('splitInvoiceLines');
    expect(openSrc).toContain('restoreAccessoryStock');

    const invoiceSrc = read('../../src/domain/sales/invoices.service.ts');
    expect(invoiceSrc).toContain('splitInvoiceLines');
    expect(invoiceSrc).toContain('getReturnedLineIds');
    // voidInvoice must no longer write a movement straight from an unfiltered line.
    expect(invoiceSrc).not.toContain('roll_id: line.roll_id');
  });

  it('the constraint behind the Arabic error is now named in the error handler', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(
      new URL('../../src/middleware/error-handler.ts', import.meta.url),
      'utf8',
    );
    expect(src).toContain('chk_stock_movements_entity_type');
    expect(src).toContain('chk_invoice_lines_item_type');
  });
});
