import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/connection.js';
import { createFabric } from '../src/domain/items/fabrics.service.js';
import { createColor } from '../src/domain/items/colors.service.js';
import { createTopBatch, splitTop } from '../src/domain/items/tops.service.js';
import { create as createCustomerRecord } from '../src/domain/customers/customersService.js';
import { createSale, getInvoiceDetail } from '../src/domain/sales/invoices.service.js';
import { createReturnFromRollScan } from '../src/domain/sales/returnsService.js';
import { cancelOpenInvoice } from '../src/domain/sales/openInvoices.service.js';

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
    name_ar: `عميل أمتار ${stamp()}`,
    phone: `010${serial}`,
  });
  return Number(customer.id);
}

async function createMeterRoll(lengthM: number, weightKg: number): Promise<number> {
  const id = stamp();
  const fabric = await createFabric({
    name_ar: `قماش أمتار ${id}`,
    width_cm: 150,
    grade: 'A',
    unit: 'meter',
  });
  const color = await createColor({ name_ar: `لون أمتار ${id}` });
  const batch = await createTopBatch(
    {
      fabric: { id: Number(fabric.id) },
      rolls: [{
        color: { id: Number(color.id) },
        length_m: lengthM,
        weight_kg: weightKg,
        width_cm: 150,
      }],
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
      payments: [{
        method: 'cheque',
        amount: total,
        chequeDetails: {
          chequeNumber: `Q-${stamp()}`,
          bankNameAr: 'بنك الاختبار',
          issueDate: '2026-09-06',
          dueDate: '2026-09-06',
        },
      }],
    },
    null,
  );
}

describe.skipIf(!RUN_DB).sequential('fabric invoice quantity integration', () => {
  beforeAll(async () => {
    const actor = await db('users').whereIn('role', ['owner', 'super_admin']).orderBy('id').first('id');
    if (!actor) throw new Error('TEST_ACTOR_NOT_FOUND');
    actorUserId = Number(actor.id);
  });

  afterAll(async () => {
    if (RUN_DB) await db.destroy();
  });

  it('stores and serves 55 sold meters separately from 28 kg at 180/m', async () => {
    const rollId = await createMeterRoll(55, 28);
    const invoice = await sellRoll(rollId, await createCustomer(), 180, 9900);

    const detail = await getInvoiceDetail(Number(invoice.id));
    expect(detail?.lines[0]).toMatchObject({
      sold_quantity: '55.000',
      sold_unit: 'meter',
      length_m: '55.000',
      weight_kg: '28.000',
      final_price_per_unit: '180.00',
      line_total_egp: '9900.00',
    });
  });

  it('splits 100 m into 45 + 55, sells 55, and restores that same 55 m roll', async () => {
    const originalId = await createMeterRoll(100, 50);
    const split = await splitTop(originalId, 55, actorUserId);
    expect(Number(split.original.length_m)).toBe(45);
    expect(Number(split.rib.length_m)).toBe(55);

    const soldId = Number(split.rib.id);
    const invoice = await sellRoll(soldId, await createCustomer(), 180, 9900);
    expect((await db('rolls').where({ id: originalId }).first()).status).toBe('in_stock');
    expect(Number((await db('rolls').where({ id: originalId }).first()).length_m)).toBe(45);
    expect((await db('rolls').where({ id: soldId }).first()).status).toBe('sold');

    await createReturnFromRollScan({
      rollId: soldId,
      refundMethod: 'cheque',
      chequeDetails: {
        chequeNumber: `RQ-${stamp()}`,
        bankNameAr: 'بنك الاختبار',
        issueDate: '2026-09-06',
        dueDate: '2026-09-06',
      },
      actorUserId,
      shiftId: null,
    });

    const restored = await db('rolls').where({ id: soldId }).first();
    expect(restored.status).toBe('in_stock');
    expect(Number(restored.length_m)).toBe(55);

    const line = await db('invoice_lines').where({ invoice_id: invoice.id, roll_id: soldId }).first();
    expect(Number(line.sold_quantity)).toBe(55);
    expect(line.sold_unit).toBe('meter');
  });

  it('prices 20 m at 250/m and cancellation restores the unchanged 20 m roll', async () => {
    const rollId = await createMeterRoll(20, 11.25);
    const invoice = await createSale(
      actorUserId,
      {
        customerId: await createCustomer(),
        fulfillmentDestination: 'factory_direct',
        lines: [{ rollId, finalPricePerUnit: 250 }],
        payments: [],
      },
      null,
    );

    expect(invoice.status).toBe('open');
    expect(Number(invoice.total_egp)).toBe(5000);
    expect((await db('rolls').where({ id: rollId }).first()).status).toBe('reserved');

    await cancelOpenInvoice(Number(invoice.id), actorUserId, {
      depositHandling: 'keep_as_credit',
      notesAr: 'إلغاء اختبار كمية الأمتار',
      shiftId: null,
    });

    const restored = await db('rolls').where({ id: rollId }).first();
    expect(restored.status).toBe('in_stock');
    expect(Number(restored.length_m)).toBe(20);
    const line = await db('invoice_lines').where({ invoice_id: invoice.id, roll_id: rollId }).first();
    expect(Number(line.sold_quantity)).toBe(20);
    expect(line.sold_unit).toBe('meter');
  });
});
