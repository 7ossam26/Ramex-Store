// الطلبيات: «قيد الشحن» lock on أتواب added to a طلبية, review decisions
// taking effect immediately (partial deliveries), undo while untouched, and
// the طلبية closing itself once nothing is pending.
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

  it('accepting receives the توب into the shop immediately; the rest stay pending for a later delivery', async () => {
    const [a, b, c, d] = [await makeFactoryRoll(), await makeFactoryRoll(), await makeFactoryRoll(), await makeFactoryRoll()];
    const { shipmentId, lineIds: [la, lb, lc, ld] } = await draftWith([a, b, c, d]);
    await submit(shipmentId, actorUserId);

    // First delivery: two أتواب arrive.
    expect((await reviewLines(shipmentId, actorUserId, { line_ids: [la, lb], action: 'accept' })).length).toBe(2);
    expect(await rollState(a)).toEqual({ status: 'in_stock', warehouse: 'shop' });
    expect(await rollState(b)).toEqual({ status: 'in_stock', warehouse: 'shop' });
    expect(await rollState(c)).toEqual({ status: 'in_transit', warehouse: 'factory' });
    let shipment = await db('shipments').where({ id: shipmentId }).first('status');
    expect(shipment.status).toBe('pending_approval');

    // «قبول الكل» on decided lines does nothing; single decided line keeps its code.
    expect(await code(reviewLines(shipmentId, actorUserId, { line_ids: [la, lb], action: 'accept' })))
      .toBe('NOTHING_TO_REVIEW');
    expect(await code(reviewLine(shipmentId, la, actorUserId, 'reject'))).toBe('LINE_ALREADY_REVIEWED');
    expect(await code(acceptShipment(shipmentId, actorUserId, {}))).toBe('REVIEW_INCOMPLETE');

    // Undo an untouched accept: back to «قيد الشحن» in the factory.
    const reset = await reviewLines(shipmentId, actorUserId, { line_ids: [lb], action: 'reset' });
    expect(reset[0].status).toBe('pending');
    expect(await rollState(b)).toEqual({ status: 'in_transit', warehouse: 'factory' });

    // Undo is refused once the توب was touched after the decision.
    await db('rolls').where({ id: a }).update({ status: 'sold' });
    expect(await code(reviewLines(shipmentId, actorUserId, { line_ids: [la], action: 'reset' })))
      .toBe('LINE_UNDO_NOT_ALLOWED');
    await db('rolls').where({ id: a }).update({ status: 'in_stock' });

    // Reject goes back to the factory right away and can be sent again
    // even while this طلبية is still open.
    await reviewLines(shipmentId, actorUserId, { line_ids: [lc], action: 'reject', reject_reason_ar: '  ' });
    const rejectedC = await db('shipment_lines').where({ id: lc }).first();
    expect(rejectedC.status).toBe('rejected');
    expect(rejectedC.reject_reason_ar).toBeNull();
    expect(await rollState(c)).toEqual({ status: 'in_stock', warehouse: 'factory' });
    const again = await draftWith([c]);
    expect((await rollState(c)).status).toBe('in_transit');
    await deleteDraft(again.shipmentId, actorUserId);

    // Second delivery: the last pending أتواب arrive — the طلبية closes itself.
    await reviewLines(shipmentId, actorUserId, { line_ids: [lb, ld], action: 'accept' });
    shipment = await db('shipments').where({ id: shipmentId }).first('status');
    expect(shipment.status).toBe('partial_approved');
    expect(await rollState(d)).toEqual({ status: 'in_stock', warehouse: 'shop' });

    // Closed: nothing can be re-run or undone.
    expect(await code(acceptShipment(shipmentId, actorUserId, {}))).toBe('SHIPMENT_NOT_REVIEWABLE');
    expect(await code(reviewLines(shipmentId, actorUserId, { line_ids: [la], action: 'reset' })))
      .toBe('SHIPMENT_NOT_REVIEWABLE');

    // a, b (accepted twice — once undone), d → 4 shipment_in, 1 reversal.
    const moves = await db('stock_movements')
      .where({ reference_type: 'shipment', reference_id: shipmentId })
      .select('event_type');
    expect(moves.filter((m) => m.event_type === 'shipment_in').length).toBe(4);
    expect(moves.filter((m) => m.event_type === 'shipment_reject_back').length).toBe(1);
  });

  it('a metre توب that lost its length cannot be accepted', async () => {
    const m = await makeFactoryRoll('meter');
    const { shipmentId, lineIds: [lm] } = await draftWith([m]);
    await submit(shipmentId, actorUserId);
    await db('rolls').where({ id: m }).update({ length_m: null });
    expect(await code(reviewLines(shipmentId, actorUserId, { line_ids: [lm], action: 'accept' })))
      .toBe('METER_ROLL_MISSING_LENGTH');
    expect(await rollState(m)).toEqual({ status: 'in_transit', warehouse: 'factory' });
    await db('rolls').where({ id: m }).update({ length_m: 50 });
    await reviewLines(shipmentId, actorUserId, { line_ids: [lm], action: 'accept' });
    expect((await db('shipments').where({ id: shipmentId }).first('status')).status).toBe('approved');
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
    expect((await db('shipments').where({ id: s1.shipmentId }).first('status')).status).toBe('rejected');
    expect(await rollState(a)).toEqual({ status: 'in_stock', warehouse: 'factory' });
    await deleteDraft(s2.shipmentId, actorUserId);
  });
});
