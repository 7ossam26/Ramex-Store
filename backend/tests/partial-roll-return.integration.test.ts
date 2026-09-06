// Partial roll/fabric return — a customer may return less than the full
// quantity sold on a line, in multiple installments, until the line is fully
// returned; then any further return is rejected.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/connection.js';
import { createFabric } from '../src/domain/items/fabrics.service.js';
import { createColor } from '../src/domain/items/colors.service.js';
import { createTopBatch } from '../src/domain/items/tops.service.js';
import { create as createCustomerRecord } from '../src/domain/customers/customersService.js';
import { createSale, getInvoiceDetail } from '../src/domain/sales/invoices.service.js';
import { processReturn, getReturnDetail } from '../src/domain/sales/returnsService.js';

const RUN_DB = process.env.RUN_DB_TESTS === '1';
let actorUserId: number;
let sequence = 0;

function stamp(): string {
  sequence += 1;
  return `${Date.now()}-${sequence}`;
}

async function createCustomer(): Promise<number> {
  const serial = String(Date.now()).slice(-6) + String(sequence).padStart(2, '0');
  const customer = await createCustomerRecord(actorUserId, {
    name_ar: `عميل جزئي ${stamp()}`,
    phone: `012${serial}`,
  });
  return Number(customer.id);
}

/** A meter-unit roll, so the requirement's own "100 meters" example applies literally. */
async function createMeterRoll(lengthM: number): Promise<number> {
  const id = stamp();
  const fabric = await createFabric({ name_ar: `قماش جزئي ${id}`, width_cm: 150, grade: 'A', unit: 'meter' });
  const color = await createColor({ name_ar: `لون جزئي ${id}` });
  const batch = await createTopBatch(
    {
      fabric: { id: Number(fabric.id) },
      rolls: [{ color: { id: Number(color.id) }, length_m: lengthM, weight_kg: lengthM / 2, width_cm: 150 }],
    },
    actorUserId,
  );
  return Number(batch.rolls[0].id);
}

async function sellRoll(rollId: number, customerId: number, unitPrice: number, total: number) {
  return createSale(
    actorUserId,
    {
      customerId,
      fulfillmentDestination: 'factory_direct',
      lines: [{ rollId, finalPricePerUnit: unitPrice }],
      payments: [{ method: 'cash', amount: total }],
    },
    null,
  );
}

describe.skipIf(!RUN_DB).sequential('partial roll/fabric return', () => {
  beforeAll(async () => {
    const actor = await db('users').whereIn('role', ['owner', 'super_admin']).orderBy('id').first('id');
    if (!actor) throw new Error('TEST_ACTOR_NOT_FOUND');
    actorUserId = Number(actor.id);
  });

  afterAll(async () => {
    if (RUN_DB) await db.destroy();
  });

  it('the 100m example: 30 → 20 → 50, then a further return is rejected', async () => {
    const rollId = await createMeterRoll(100);
    const customerId = await createCustomer();
    // 10 EGP/m × 100m = 1000.
    const invoice = await sellRoll(rollId, customerId, 10, 1000);

    let detail = await getInvoiceDetail(Number(invoice.id));
    const line = detail!.lines[0]!;
    expect(Number(line.remaining_returnable_quantity)).toBe(100);

    // Return 30.
    const ret1 = await processReturn({
      originalInvoiceId: Number(invoice.id),
      lines: [{ originalLineId: line.id, rollId, refundAmountEgp: 300, returnQuantity: 30, disposition: 'back_to_stock' }],
      refundMethod: 'cash',
      actorUserId,
      actorRole: 'owner',
    });
    expect(ret1.total_refund_egp).toBe('300.00');

    let roll = await db('rolls').where({ id: rollId }).first();
    expect(roll.status).toBe('in_stock');
    expect(Number(roll.length_m)).toBe(30);

    detail = await getInvoiceDetail(Number(invoice.id));
    expect(detail?.status).toBe('partially_returned');
    expect(Number(detail?.returned_amount_egp)).toBe(300);
    const lineAfter1 = detail!.lines[0]!;
    expect(Number(lineAfter1.remaining_returnable_quantity)).toBe(70);
    expect(lineAfter1.is_returned).toBe(false);

    // Return 20 more (50 total).
    await processReturn({
      originalInvoiceId: Number(invoice.id),
      lines: [{ originalLineId: line.id, rollId, refundAmountEgp: 200, returnQuantity: 20, disposition: 'back_to_stock' }],
      refundMethod: 'cash',
      actorUserId,
      actorRole: 'owner',
    });

    roll = await db('rolls').where({ id: rollId }).first();
    expect(Number(roll.length_m)).toBe(50);
    detail = await getInvoiceDetail(Number(invoice.id));
    expect(detail?.status).toBe('partially_returned');
    expect(Number(detail?.returned_amount_egp)).toBe(500);
    expect(Number(detail!.lines[0]!.remaining_returnable_quantity)).toBe(50);

    // Return the remaining 50 — the line (and invoice) is now fully returned.
    await processReturn({
      originalInvoiceId: Number(invoice.id),
      lines: [{ originalLineId: line.id, rollId, refundAmountEgp: 500, returnQuantity: 50, disposition: 'back_to_stock' }],
      refundMethod: 'cash',
      actorUserId,
      actorRole: 'owner',
    });

    roll = await db('rolls').where({ id: rollId }).first();
    expect(roll.status).toBe('in_stock');
    expect(Number(roll.length_m)).toBe(100);
    detail = await getInvoiceDetail(Number(invoice.id));
    expect(detail?.status).toBe('returned');
    expect(Number(detail?.returned_amount_egp)).toBe(1000);
    expect(detail!.lines[0]!.is_returned).toBe(true);
    expect(Number(detail!.lines[0]!.remaining_returnable_quantity)).toBe(0);

    // A further return of any amount is rejected.
    await expect(
      processReturn({
        originalInvoiceId: Number(invoice.id),
        lines: [{ originalLineId: line.id, rollId, refundAmountEgp: 10, returnQuantity: 1, disposition: 'back_to_stock' }],
        refundMethod: 'cash',
        actorUserId,
        actorRole: 'owner',
      }),
    ).rejects.toThrow('RETURN_LINE_ALREADY_RETURNED');
  });

  it('a request exceeding the remaining quantity is rejected, and stock/refund stay untouched', async () => {
    const rollId = await createMeterRoll(40);
    const customerId = await createCustomer();
    const invoice = await sellRoll(rollId, customerId, 25, 1000);
    const detail = await getInvoiceDetail(Number(invoice.id));
    const line = detail!.lines[0]!;

    await processReturn({
      originalInvoiceId: Number(invoice.id),
      lines: [{ originalLineId: line.id, rollId, refundAmountEgp: 250, returnQuantity: 10, disposition: 'back_to_stock' }],
      refundMethod: 'cash',
      actorUserId,
      actorRole: 'owner',
    });
    // 30 remain.

    await expect(
      processReturn({
        originalInvoiceId: Number(invoice.id),
        lines: [{ originalLineId: line.id, rollId, refundAmountEgp: 1000, returnQuantity: 31, disposition: 'back_to_stock' }],
        refundMethod: 'cash',
        actorUserId,
        actorRole: 'owner',
      }),
    ).rejects.toThrow('RETURN_QUANTITY_EXCEEDS_REMAINING');

    // Nothing changed from the rejected attempt.
    const roll = await db('rolls').where({ id: rollId }).first();
    expect(Number(roll.length_m)).toBe(10);
    const refundTotal = await db('payments')
      .where({ invoice_id: invoice.id, payment_kind: 'refund' })
      .sum({ total: 'amount_egp' })
      .first();
    expect(Number(refundTotal?.total)).toBe(-250);
  });

  it('the requested refund is capped at what the returned quantity is actually worth, even if the client asks for more', async () => {
    const rollId = await createMeterRoll(50);
    const customerId = await createCustomer();
    const invoice = await sellRoll(rollId, customerId, 20, 1000);
    const detail = await getInvoiceDetail(Number(invoice.id));
    const line = detail!.lines[0]!;

    // Return only 10 of 50 metres, but ask for the FULL 1000 refund — must be
    // capped at the proportional share (200), not honoured verbatim.
    const ret = await processReturn({
      originalInvoiceId: Number(invoice.id),
      lines: [{ originalLineId: line.id, rollId, refundAmountEgp: 1000, returnQuantity: 10, disposition: 'back_to_stock' }],
      refundMethod: 'cash',
      actorUserId,
      actorRole: 'owner',
    });
    expect(ret.total_refund_egp).toBe('200.00');

    const refundTotal = await db('payments')
      .where({ invoice_id: invoice.id, payment_kind: 'refund' })
      .sum({ total: 'amount_egp' })
      .first();
    expect(Number(refundTotal?.total)).toBe(-200);
  });

  it('return-slip PDF data (getReturnDetail) reports the actual returned quantity for each partial return', async () => {
    const rollId = await createMeterRoll(60);
    const customerId = await createCustomer();
    const invoice = await sellRoll(rollId, customerId, 15, 900);
    const detail = await getInvoiceDetail(Number(invoice.id));
    const line = detail!.lines[0]!;

    const ret1 = await processReturn({
      originalInvoiceId: Number(invoice.id),
      lines: [{ originalLineId: line.id, rollId, refundAmountEgp: 225, returnQuantity: 15, disposition: 'back_to_stock' }],
      refundMethod: 'cash',
      actorUserId,
      actorRole: 'owner',
    });
    const ret2 = await processReturn({
      originalInvoiceId: Number(invoice.id),
      lines: [{ originalLineId: line.id, rollId, refundAmountEgp: 300, returnQuantity: 20, disposition: 'back_to_stock' }],
      refundMethod: 'cash',
      actorUserId,
      actorRole: 'owner',
    });

    const detail1 = await getReturnDetail(ret1.id);
    expect(detail1?.lines[0]?.returned_quantity).toBe('15.000');
    const detail2 = await getReturnDetail(ret2.id);
    expect(detail2?.lines[0]?.returned_quantity).toBe('20.000');
  });
});
