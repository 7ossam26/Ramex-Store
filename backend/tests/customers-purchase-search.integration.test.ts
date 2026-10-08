// العملاء — the search box also finds customers by anything they bought:
// خامة, لون, the توب's barcode, or an إكسسوار. Returned or voided purchases
// no longer count.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/connection.js';
import { createFabric } from '../src/domain/items/fabrics.service.js';
import { createColor } from '../src/domain/items/colors.service.js';
import { createTopBatch } from '../src/domain/items/tops.service.js';
import { createAccessory } from '../src/domain/accessories/accessories.service.js';
import { create as createCustomerRecord, list, listForExport } from '../src/domain/customers/customersService.js';
import { createSale, voidInvoice } from '../src/domain/sales/invoices.service.js';
import { createReturnFromRollScan } from '../src/domain/sales/returnsService.js';
import { ListCustomersQuerySchema } from '../src/domain/customers/customers.schemas.js';

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
    name_ar: `عميل مشتريات ${stamp()}`,
    phone: `012${serial}`,
  });
  return Number(customer.id);
}

async function createRoll(fabricId: number, colorId: number): Promise<number> {
  const batch = await createTopBatch(
    { fabric: { id: fabricId }, rolls: [{ color: { id: colorId }, weight_kg: 10, width_cm: 150 }] },
    actorUserId,
  );
  return Number(batch.rolls[0].id);
}

type Line =
  | { rollId: number; finalPricePerUnit: number }
  | { type: 'accessory'; accessoryId: number; qtyPieces: number; finalPricePerPiece: number };

async function sell(lines: Line[], customerId: number, total: number) {
  return createSale(
    actorUserId,
    {
      customerId,
      fulfillmentDestination: 'factory_direct',
      lines: lines as never,
      payments: [{ method: 'cash', amount: total }],
    },
    null,
  );
}

describe('ListCustomersQuerySchema', () => {
  it('search_purchases is an opt-in flag', () => {
    expect(ListCustomersQuerySchema.parse({ search_purchases: '1' }).search_purchases).toBe(true);
    expect(ListCustomersQuerySchema.parse({ search_purchases: 'false' }).search_purchases).toBe(false);
    expect(ListCustomersQuerySchema.parse({}).search_purchases).toBe(false);
  });
});

describe.skipIf(!RUN_DB).sequential('customers search — by what they bought', () => {
  let tag: string;
  let fabricName: string;
  let redName: string;
  let accessoryName: string;
  let redRollBarcode: string;
  let holder: number;
  let blueBuyer: number;
  let accessoryBuyer: number;
  let returner: number;
  let voider: number;

  const page = { balance: 'all' as const, sort: 'created_at' as const, page: 1, limit: 100 };
  const search = (q: string, searchPurchases = true) => list({ ...page, search: q, search_purchases: searchPurchases });
  const ids = (rows: Array<{ id: number }>) => rows.map((r) => Number(r.id)).sort();

  beforeAll(async () => {
    const actor = await db('users').whereIn('role', ['owner', 'super_admin']).orderBy('id').first('id');
    if (!actor) throw new Error('TEST_ACTOR_NOT_FOUND');
    actorUserId = Number(actor.id);

    tag = stamp().replace('-', '');
    fabricName = `قطنبحث${tag}`;
    redName = `أحمربحث${tag}`;
    accessoryName = `زرار بحث ${tag}`;
    const fabric = Number((await createFabric({ name_ar: fabricName, width_cm: 150, grade: 'A', unit: 'kg' })).id);
    const red = Number((await createColor({ name_ar: redName })).id);
    const blue = Number((await createColor({ name_ar: `أزرقبحث${tag}` })).id);
    const acc = await createAccessory({ name_ar: accessoryName, quantity: 100, selling_price_egp: 5 }, actorUserId);

    holder = await createCustomer();
    const redRoll = await createRoll(fabric, red);
    redRollBarcode = (await db('rolls').where({ id: redRoll }).first('internal_barcode')).internal_barcode;
    await sell(
      [{ rollId: redRoll, finalPricePerUnit: 10 }, { rollId: await createRoll(fabric, red), finalPricePerUnit: 10 }],
      holder,
      200,
    );

    blueBuyer = await createCustomer();
    await sell([{ rollId: await createRoll(fabric, blue), finalPricePerUnit: 10 }], blueBuyer, 100);

    accessoryBuyer = await createCustomer();
    await sell(
      [{ type: 'accessory', accessoryId: Number(acc.id), qtyPieces: 12, finalPricePerPiece: 5 }],
      accessoryBuyer,
      60,
    );

    returner = await createCustomer();
    const returnedRoll = await createRoll(fabric, red);
    await sell([{ rollId: returnedRoll, finalPricePerUnit: 10 }], returner, 100);
    await createReturnFromRollScan({ rollId: returnedRoll, refundMethod: 'cash', actorUserId, shiftId: null });

    voider = await createCustomer();
    const voided = await sell([{ rollId: await createRoll(fabric, red), finalPricePerUnit: 10 }], voider, 100);
    await voidInvoice(Number(voided.id), actorUserId, 'owner', 'اختبار', true);
  });

  afterAll(async () => {
    if (RUN_DB) await db.destroy();
  });

  it('a خامة finds everyone still holding it, and says what matched', async () => {
    const { rows, total } = await search(fabricName);
    expect(ids(rows)).toEqual([holder, blueBuyer].sort());
    expect(total).toBe(2);
    expect(rows.find((r) => Number(r.id) === holder)!.matched_items).toBe(`${fabricName} ${redName} (2 توب)`);
  });

  it('a لون, «خامة لون» together, or a توب barcode narrow it down', async () => {
    expect(ids((await search(redName)).rows)).toEqual([holder]);
    expect(ids((await search(`${fabricName} ${redName}`)).rows)).toEqual([holder]);
    expect(ids((await search(redRollBarcode)).rows)).toEqual([holder]);
  });

  it('an إكسسوار finds its buyer with the piece count', async () => {
    const { rows } = await search(accessoryName);
    expect(ids(rows)).toEqual([accessoryBuyer]);
    expect(rows[0].matched_items).toBe(`${accessoryName} (12 قطعة)`);
  });

  it('name search keeps working in the same box', async () => {
    const holderName = (await db('customers').where({ id: holder }).first('name_ar')).name_ar as string;
    const { rows } = await search(holderName);
    expect(ids(rows)).toEqual([holder]);
    expect(rows[0].matched_items).toBeNull();
  });

  it('the export follows the same search', async () => {
    const exported = await listForExport({
      search: fabricName, search_purchases: true, balance: 'all', sort: 'created_at', format: 'pdf',
    });
    expect(ids(exported)).toEqual([holder, blueBuyer].sort());
  });

  it('without the flag (POS picker) a purchase matches nothing', async () => {
    expect((await search(fabricName, false)).rows).toEqual([]);
    const all = await list({ ...page, search_purchases: false });
    expect(all.rows[0]).not.toHaveProperty('matched_items');
    expect(all.rows.map((r) => Number(r.id))).toEqual(expect.arrayContaining([holder, returner, voider]));
  });
});
