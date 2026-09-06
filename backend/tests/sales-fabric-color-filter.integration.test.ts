// Sales (invoices) list — filter by fabric and/or colour, server-side,
// correctly combined with AND logic and staying correct across pagination.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/connection.js';
import { createFabric } from '../src/domain/items/fabrics.service.js';
import { createColor } from '../src/domain/items/colors.service.js';
import { createTopBatch } from '../src/domain/items/tops.service.js';
import { create as createCustomerRecord } from '../src/domain/customers/customersService.js';
import { createSale, listInvoices } from '../src/domain/sales/invoices.service.js';
import { ListInvoicesQuerySchema } from '../src/domain/sales/sales.schemas.js';

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
    name_ar: `عميل تصفية ${stamp()}`,
    phone: `015${serial}`,
  });
  return Number(customer.id);
}

async function createRoll(fabricId: number, colorId: number, weightKg = 10): Promise<number> {
  const batch = await createTopBatch(
    { fabric: { id: fabricId }, rolls: [{ color: { id: colorId }, weight_kg: weightKg, width_cm: 150 }] },
    actorUserId,
  );
  return Number(batch.rolls[0].id);
}

async function sellRoll(rollId: number, customerId: number, total: number) {
  return createSale(
    actorUserId,
    {
      customerId,
      fulfillmentDestination: 'factory_direct',
      lines: [{ rollId, finalPricePerUnit: total / 10 }],
      payments: [{ method: 'cash', amount: total }],
    },
    null,
  );
}

describe('ListInvoicesQuerySchema', () => {
  it('accepts fabric_id and color_id together', () => {
    const parsed = ListInvoicesQuerySchema.safeParse({ fabric_id: '3', color_id: '5' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.fabric_id).toBe(3);
      expect(parsed.data.color_id).toBe(5);
    }
  });
  it('leaves them optional so existing callers are unaffected', () => {
    const parsed = ListInvoicesQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.fabric_id).toBeUndefined();
      expect(parsed.data.color_id).toBeUndefined();
    }
  });
  it('still accepts the new return-state statuses alongside the existing ones', () => {
    for (const status of ['open', 'completed', 'cancelled', 'returned', 'partially_returned']) {
      expect(ListInvoicesQuerySchema.safeParse({ status }).success, status).toBe(true);
    }
  });
});

describe.skipIf(!RUN_DB).sequential('listInvoices — fabric/colour filter (server-side)', () => {
  let fabricA: number, fabricB: number, colorRed: number, colorBlue: number;
  let customerId: number;
  let invRedA: number, invBlueA: number, invRedB: number;

  beforeAll(async () => {
    const actor = await db('users').whereIn('role', ['owner', 'super_admin']).orderBy('id').first('id');
    if (!actor) throw new Error('TEST_ACTOR_NOT_FOUND');
    actorUserId = Number(actor.id);

    const id = stamp();
    fabricA = Number((await createFabric({ name_ar: `قماش أ ${id}`, width_cm: 150, grade: 'A', unit: 'kg' })).id);
    fabricB = Number((await createFabric({ name_ar: `قماش ب ${id}`, width_cm: 150, grade: 'A', unit: 'kg' })).id);
    colorRed = Number((await createColor({ name_ar: `أحمر ${id}` })).id);
    colorBlue = Number((await createColor({ name_ar: `أزرق ${id}` })).id);

    customerId = await createCustomer();

    // fabricA + red, fabricA + blue, fabricB + red — lets us test both single
    // filters and the fabric+colour AND combination distinguishes lines.
    invRedA = Number((await sellRoll(await createRoll(fabricA, colorRed), customerId, 100)).id);
    invBlueA = Number((await sellRoll(await createRoll(fabricA, colorBlue), customerId, 100)).id);
    invRedB = Number((await sellRoll(await createRoll(fabricB, colorRed), customerId, 100)).id);
  });

  afterAll(async () => {
    if (RUN_DB) await db.destroy();
  });

  it('filters by fabric alone', async () => {
    const { rows, total } = await listInvoices({ page: 1, limit: 50, fabric_id: fabricA });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(invRedA);
    expect(ids).toContain(invBlueA);
    expect(ids).not.toContain(invRedB);
    expect(total).toBe(rows.length);
  });

  it('filters by colour alone', async () => {
    const { rows } = await listInvoices({ page: 1, limit: 50, color_id: colorRed });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(invRedA);
    expect(ids).toContain(invRedB);
    expect(ids).not.toContain(invBlueA);
  });

  it('combines fabric + colour with AND logic', async () => {
    const { rows } = await listInvoices({ page: 1, limit: 50, fabric_id: fabricA, color_id: colorRed });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(invRedA);
    expect(ids).not.toContain(invBlueA); // right fabric, wrong colour
    expect(ids).not.toContain(invRedB); // right colour, wrong fabric
  });

  it('does not duplicate rows and the count matches the page (whereExists, not a join)', async () => {
    const { rows, total } = await listInvoices({ page: 1, limit: 50, fabric_id: fabricA });
    const uniqueIds = new Set(rows.map((r) => r.id));
    expect(uniqueIds.size).toBe(rows.length);
    expect(total).toBe(rows.length);
  });

  it('pagination stays correct alongside the fabric filter', async () => {
    const page1 = await listInvoices({ page: 1, limit: 1, fabric_id: fabricA });
    expect(page1.rows).toHaveLength(1);
    expect(page1.total).toBe(2);
    const page2 = await listInvoices({ page: 2, limit: 1, fabric_id: fabricA });
    expect(page2.rows).toHaveLength(1);
    expect(page1.rows[0]!.id).not.toBe(page2.rows[0]!.id);
  });

  it('an unmatched fabric/colour combination returns zero rows without erroring', async () => {
    const { rows, total } = await listInvoices({ page: 1, limit: 50, fabric_id: fabricB, color_id: colorBlue });
    expect(rows).toHaveLength(0);
    expect(total).toBe(0);
  });
});
