// الطلبيات: «قيد الشحن» lock on أتواب added to a طلبية, bulk review with
// undo, and partial confirmation being final (no second confirm).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/connection.js';
import { createFabric } from '../src/domain/items/fabrics.service.js';
import { createColor } from '../src/domain/items/colors.service.js';
import { createTopBatch, splitTop } from '../src/domain/items/tops.service.js';
import { updateRoll } from '../src/domain/items/rolls.service.js';
import { createAdjustment } from '../src/domain/inventory/adjustments.service.js';
import { createDamageEvent } from '../src/domain/inventory/damage.service.js';
import {
  acceptShipment,
  addRoll,
  createDraft,
  deleteDraft,
  removeLine,
  reviewLine,
  reviewLines,
  submit,
} from '../src/domain/inventory/shipments.service.js';

const RUN_DB = process.env.RUN_DB_TESTS === '1';
let actorUserId: number;
let sequence = 0;

function stamp(): string {
  sequence += 1;
  return `${Date.now()}-${sequence}`;
}

/** A kg توب in the factory, ready to be sent. */
async function makeFactoryRoll(unit: 'kg' | 'meter' = 'kg'): Promise<number> {
  const id = stamp();
  const fabric = await createFabric({ name_ar: `قماش طلبية ${id}`, width_cm: 150, grade: 'A', unit });
  const color = await createColor({ name_ar: `لون طلبية ${id}` });
  const batch = await createTopBatch(
    {
      fabric: { id: Number(fabric.id) },
      rolls: [{ color: { id: Number(color.id) }, weight_kg: 10, ...(unit === 'meter' ? { length_m: 50 } : {}), width_cm: 150 }],
    },
    actorUserId,
  );
  const rollId = Number(batch.rolls[0].id);
  await db('rolls').where({ id: rollId }).update({ warehouse: 'factory', status: 'in_stock' });
  return rollId;
}

async function rollState(id: number): Promise<{ status: string; warehouse: string }> {
  const r = await db('rolls').where({ id }).first('status', 'warehouse');
  return { status: r.status, warehouse: r.warehouse };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'OK';
  } catch (e) {
    return (e as Error & { code?: string }).code ?? (e as Error).message;
  }
}

/** Draft with the given أتواب; returns shipment and line ids in roll order. */
async function draftWith(rollIds: number[]): Promise<{ shipmentId: number; lineIds: number[] }> {
  const shipment = await createDraft(actorUserId, {});
  const lineIds: number[] = [];
  for (const rollId of rollIds) {
    const { line } = await addRoll(shipment.id, actorUserId, { roll_id: rollId });
    lineIds.push(Number(line.id));
  }
  return { shipmentId: Number(shipment.id), lineIds };
}

describe.skipIf(!RUN_DB).sequential('shipment review + in-transit lock', () => {
  beforeAll(async () => {
    const actor = await db('users').whereIn('role', ['owner', 'super_admin']).orderBy('id').first('id');
    if (!actor) throw new Error('TEST_ACTOR_NOT_FOUND');
    actorUserId = Number(actor.id);
  });

  afterAll(async () => {
    if (RUN_DB) await db.destroy();
  });

  it('a توب is «قيد الشحن» from the moment it is added, and released when removed or the draft is deleted', async () => {
    const a = await makeFactoryRoll();
    const b = await makeFactoryRoll();
    const { shipmentId, lineIds } = await draftWith([a, b]);
    expect(await rollState(a)).toEqual({ status: 'in_transit', warehouse: 'factory' });

    await removeLine(shipmentId, lineIds[0], actorUserId);
    expect((await rollState(a)).status).toBe('in_stock');
    expect((await rollState(b)).status).toBe('in_transit');

    await deleteDraft(shipmentId, actorUserId);
    expect((await rollState(b)).status).toBe('in_stock');
  });

  it('blocks تسوية, تقسيم, تعديل and تلف on a توب «قيد الشحن»', async () => {
    const a = await makeFactoryRoll();
    const { shipmentId } = await draftWith([a]);

    expect(await code(createAdjustment(actorUserId, {
      entity_type: 'roll', roll_id: a, new_weight_kg: 5, notes_ar: 'test',
    }))).toBe('ROLL_IN_TRANSIT');
    expect(await code(splitTop(a, 3, actorUserId))).toBe('ROLL_IN_TRANSIT');
    expect(await code(updateRoll(a, { weight_kg: 5 }))).toBe('ROLL_IN_TRANSIT');
    expect(await code(createDamageEvent(actorUserId, {
      roll_id: a, reason_code: 'damage_in_shop', disposition: 'damaged_stock',
    }))).toBe('ROLL_IN_TRANSIT');

    const r = await db('rolls').where({ id: a }).first('weight_kg');
    expect(Number(r.weight_kg)).toBe(10);
    await deleteDraft(shipmentId, actorUserId);
  });

  it('a metre توب without a length cannot be added to a طلبية', async () => {
    const m = await makeFactoryRoll('meter');
    await db('rolls').where({ id: m }).update({ length_m: null });
    const shipment = await createDraft(actorUserId, {});
    expect(await code(addRoll(shipment.id, actorUserId, { roll_id: m }))).toBe('ROLL_MISSING_LENGTH');
    expect((await rollState(m)).status).toBe('in_stock');
    await deleteDraft(shipment.id, actorUserId);
  });

  it('bulk review skips decided lines, undo returns to pending, and a partial confirm is final', async () => {
    const [a, b, c] = [await makeFactoryRoll(), await makeFactoryRoll(), await makeFactoryRoll()];
    const { shipmentId, lineIds: [la, lb, lc] } = await draftWith([a, b, c]);
    await submit(shipmentId, actorUserId);

    // Accept the selection, then «قبول الكل» only touches what is still pending.
    expect((await reviewLines(shipmentId, actorUserId, { line_ids: [la, lb], action: 'accept' })).length).toBe(2);
    await reviewLines(shipmentId, actorUserId, { line_ids: [lc], action: 'reject', reject_reason_ar: 'عيب' });
    expect(await code(reviewLines(shipmentId, actorUserId, { line_ids: [la, lb, lc], action: 'accept' })))
      .toBe('NOTHING_TO_REVIEW');
    expect(await code(reviewLine(shipmentId, la, actorUserId, 'reject'))).toBe('LINE_ALREADY_REVIEWED');

    // Undo, then decide again.
    const reset = await reviewLines(shipmentId, actorUserId, { line_ids: [lb], action: 'reset' });
    expect(reset[0].status).toBe('pending');
    expect(await code(acceptShipment(shipmentId, actorUserId, {}))).toBe('REVIEW_INCOMPLETE');
    await reviewLines(shipmentId, actorUserId, { line_ids: [la, lb, lc], action: 'reject', reject_reason_ar: '  ' });
    const rejectedB = await db('shipment_lines').where({ id: lb }).first();
    expect(rejectedB.status).toBe('rejected');
    expect(rejectedB.reject_reason_ar).toBeNull();
    const stillAccepted = await db('shipment_lines').where({ id: la }).first('status');
    expect(stillAccepted.status).toBe('accepted');

    const final = await acceptShipment(shipmentId, actorUserId, {});
    expect(final.status).toBe('partial_approved');

    // Confirming again must not re-run the receipt.
    expect(await code(acceptShipment(shipmentId, actorUserId, {}))).toBe('SHIPMENT_NOT_REVIEWABLE');
    expect(await code(reviewLines(shipmentId, actorUserId, { line_ids: [la], action: 'reset' })))
      .toBe('SHIPMENT_NOT_REVIEWABLE');
    const shipmentIn = await db('stock_movements')
      .where({ reference_type: 'shipment', reference_id: shipmentId, event_type: 'shipment_in' })
      .count<{ n: string }[]>({ n: '*' });
    expect(Number(shipmentIn[0].n)).toBe(1);

    expect(await rollState(a)).toEqual({ status: 'in_stock', warehouse: 'shop' });
    expect(await rollState(b)).toEqual({ status: 'in_stock', warehouse: 'factory' });
    expect(await rollState(c)).toEqual({ status: 'in_stock', warehouse: 'factory' });

    // A توب rejected from a partial طلبية can be sent again.
    const again = await draftWith([b]);
    expect((await rollState(b)).status).toBe('in_transit');
    await deleteDraft(again.shipmentId, actorUserId);
  });

  it('bulk review refuses lines from another طلبية', async () => {
    const [a, b] = [await makeFactoryRoll(), await makeFactoryRoll()];
    const s1 = await draftWith([a]);
    const s2 = await draftWith([b]);
    await submit(s1.shipmentId, actorUserId);
    expect(await code(reviewLines(s1.shipmentId, actorUserId, {
      line_ids: [s1.lineIds[0], s2.lineIds[0]], action: 'accept',
    }))).toBe('LINE_NOT_FOUND');

    await reviewLines(s1.shipmentId, actorUserId, { line_ids: s1.lineIds, action: 'reject' });
    expect((await acceptShipment(s1.shipmentId, actorUserId, {})).status).toBe('rejected');
    expect(await rollState(a)).toEqual({ status: 'in_stock', warehouse: 'factory' });
    await deleteDraft(s2.shipmentId, actorUserId);
  });
});
