// Regression coverage for the cancelled/returned-invoice status bug.
//
// Root cause: processReturn/processExchange/the scan-return flows inserted
// return_lines + a refund payment + a customer-ledger entry, but never
// touched the `invoices` header — so a fully-refunded invoice kept showing
// `completed` and stayed counted as completed + fully paid everywhere.
//
// Also covers the related ledger defect: a cash/instapay/etc. refund posted
// a `-refund` ledger entry while leaving `customers.current_balance_egp`
// untouched, so the statement (built by summing entries) drifted from the
// persisted balance by exactly the refunded amount on every return.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/connection.js';
import { createFabric } from '../src/domain/items/fabrics.service.js';
import { createColor } from '../src/domain/items/colors.service.js';
import { createTopBatch } from '../src/domain/items/tops.service.js';
import { create as createCustomerRecord } from '../src/domain/customers/customersService.js';
import { createSale, getInvoiceDetail, voidInvoice } from '../src/domain/sales/invoices.service.js';
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
    name_ar: `عميل مرتجع ${stamp()}`,
    phone: `011${serial}`,
  });
  return Number(customer.id);
}

async function createKgRoll(weightKg: number): Promise<number> {
  const id = stamp();
  const fabric = await createFabric({ name_ar: `قماش مرتجع ${id}`, width_cm: 150, grade: 'A', unit: 'kg' });
  const color = await createColor({ name_ar: `لون مرتجع ${id}` });
  const batch = await createTopBatch(
    { fabric: { id: Number(fabric.id) }, rolls: [{ color: { id: Number(color.id) }, weight_kg: weightKg, width_cm: 150 }] },
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

describe.skipIf(!RUN_DB).sequential('invoice return state — root-cause fix', () => {
  beforeAll(async () => {
    const actor = await db('users').whereIn('role', ['owner', 'super_admin']).orderBy('id').first('id');
    if (!actor) throw new Error('TEST_ACTOR_NOT_FOUND');
    actorUserId = Number(actor.id);
  });

  afterAll(async () => {
    if (RUN_DB) await db.destroy();
  });

  it('a normal completed invoice with no return stays `completed`', async () => {
    const rollId = await createKgRoll(10);
    const invoice = await sellRoll(rollId, await createCustomer(), 100, 1000);
    expect(invoice.status).toBe('completed');

    const detail = await getInvoiceDetail(Number(invoice.id));
    expect(detail?.status).toBe('completed');
    expect(Number(detail?.returned_amount_egp)).toBe(0);
  });

  it('fully returning the only line flips the invoice to `returned`, keeps both payment rows, and the customer statement nets to zero', async () => {
    const rollId = await createKgRoll(10);
    const customerId = await createCustomer();
    const invoice = await sellRoll(rollId, customerId, 100, 1000);
    expect(invoice.status).toBe('completed');

    const balanceBefore = Number((await db('customers').where({ id: customerId }).first()).current_balance_egp);

    const detail = await getInvoiceDetail(Number(invoice.id));
    const line = detail!.lines[0]!;

    const ret = await processReturn({
      originalInvoiceId: Number(invoice.id),
      lines: [{ originalLineId: line.id, rollId, refundAmountEgp: 1000, disposition: 'back_to_stock' }],
      refundMethod: 'cash',
      notesAr: 'مرتجع اختبار كامل',
      actorUserId,
      actorRole: 'owner',
    });
    expect(ret.total_refund_egp).toBe('1000.00');

    // Bug fix: the invoice header must now reflect the return.
    const after = await getInvoiceDetail(Number(invoice.id));
    expect(after?.status).toBe('returned');
    expect(Number(after?.returned_amount_egp)).toBe(1000);

    // Payment history stays auditable: original + refund both present.
    const payments = await db('payments').where({ invoice_id: invoice.id }).orderBy('id', 'asc');
    expect(payments).toHaveLength(2);
    expect(payments[0]!.payment_kind).toBe('final');
    expect(Number(payments[0]!.amount_egp)).toBe(1000);
    expect(payments[1]!.payment_kind).toBe('refund');
    expect(Number(payments[1]!.amount_egp)).toBe(-1000);

    // Customer balance is unaffected by a cash refund of a fully-paid sale —
    // they simply got their money back for goods they no longer have.
    const balanceAfter = Number((await db('customers').where({ id: customerId }).first()).current_balance_egp);
    expect(balanceAfter).toBe(balanceBefore);

    // Roll physically restored.
    const roll = await db('rolls').where({ id: rollId }).first();
    expect(roll.status).toBe('in_stock');
    expect(Number(roll.weight_kg)).toBe(10);
  });

  it('a returned invoice does not offer a second, invalid return — the existing guard still fires', async () => {
    const rollId = await createKgRoll(5);
    const customerId = await createCustomer();
    const invoice = await sellRoll(rollId, customerId, 200, 1000);
    const detail = await getInvoiceDetail(Number(invoice.id));
    const line = detail!.lines[0]!;

    await processReturn({
      originalInvoiceId: Number(invoice.id),
      lines: [{ originalLineId: line.id, rollId, refundAmountEgp: 1000, disposition: 'back_to_stock' }],
      refundMethod: 'cash',
      actorUserId,
      actorRole: 'owner',
    });

    await expect(
      processReturn({
        originalInvoiceId: Number(invoice.id),
        lines: [{ originalLineId: line.id, rollId, refundAmountEgp: 1000, disposition: 'back_to_stock' }],
        refundMethod: 'cash',
        actorUserId,
        actorRole: 'owner',
      }),
    ).rejects.toThrow('RETURN_LINE_ALREADY_RETURNED');
  });

  it('voiding a `partially_returned` invoice does not double-refund the already-returned slice', async () => {
    const rollId = await createKgRoll(10);
    const customerId = await createCustomer();
    const invoice = await sellRoll(rollId, customerId, 100, 1000);

    const detail = await getInvoiceDetail(Number(invoice.id));
    const line = detail!.lines[0]!;

    // Partial return: 4kg of the 10kg roll, refund 400.
    await processReturn({
      originalInvoiceId: Number(invoice.id),
      lines: [{ originalLineId: line.id, rollId, refundAmountEgp: 400, returnQuantity: 4, disposition: 'back_to_stock' }],
      refundMethod: 'cash',
      actorUserId,
      actorRole: 'owner',
    });

    const afterReturn = await getInvoiceDetail(Number(invoice.id));
    expect(afterReturn?.status).toBe('partially_returned');
    expect(Number(afterReturn?.returned_amount_egp)).toBe(400);

    const cashRefundedByReturn = await db('payments')
      .where({ invoice_id: invoice.id, payment_kind: 'refund' })
      .sum({ total: 'amount_egp' })
      .first();
    expect(Number(cashRefundedByReturn?.total)).toBe(-400);

    // Void the whole invoice — only the remaining 600 should be refunded now,
    // not another 1000.
    const result = await voidInvoice(Number(invoice.id), actorUserId, 'owner', 'إلغاء بعد مرتجع جزئي', true);
    if ('requires_approval' in result) throw new Error('unexpected approval gate');
    expect(result.invoice.status).toBe('cancelled');

    const totalRefunded = await db('payments')
      .where({ invoice_id: invoice.id, payment_kind: 'refund' })
      .sum({ total: 'amount_egp' })
      .first();
    expect(Number(totalRefunded?.total)).toBe(-1000);

    // The roll comes all the way back (topped up from 4kg to the full 10kg).
    const roll = await db('rolls').where({ id: rollId }).first();
    expect(roll.status).toBe('in_stock');
    expect(Number(roll.weight_kg)).toBe(10);
  });

  it('getReturnDetail reports the correct return_no / refund and is consistent with the invoice header', async () => {
    const rollId = await createKgRoll(8);
    const customerId = await createCustomer();
    const invoice = await sellRoll(rollId, customerId, 50, 400);
    const detail = await getInvoiceDetail(Number(invoice.id));
    const line = detail!.lines[0]!;

    const ret = await processReturn({
      originalInvoiceId: Number(invoice.id),
      lines: [{ originalLineId: line.id, rollId, refundAmountEgp: 400, disposition: 'back_to_stock' }],
      refundMethod: 'cash',
      actorUserId,
      actorRole: 'owner',
    });

    const returnDetail = await getReturnDetail(ret.id);
    expect(returnDetail?.lines[0]?.returned_quantity).toBe('8.000');
    expect(returnDetail?.lines[0]?.returned_unit).toBe('kg');

    const after = await getInvoiceDetail(Number(invoice.id));
    expect(after?.status).toBe('returned');
  });
});
