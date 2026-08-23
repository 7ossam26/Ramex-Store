// Deleting a material (خامة): permanent when nothing real is attached,
// archived otherwise. Archiving marks the name so the material stays
// recognisable as deleted everywhere it still appears.
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';
import { db } from '../src/db/connection.js';
import { ARCHIVED_SUFFIX, applyArchiveMark, stripArchiveMark } from '../src/domain/items/fabrics.service.js';

const RUN_DB = process.env.RUN_DB_TESTS === '1';
const OWNER = { username: 'owner', password: 'ChangeMe123!' };

async function auth() {
  const r = await request(app).post('/api/auth/login').send(OWNER);
  return { Authorization: `Bearer ${r.body.token as string}` };
}

async function createFabric(headers: Record<string, string>, name: string) {
  const r = await request(app).post('/api/fabrics').set(headers).send({
    name_ar: name, width_cm: 150, grade: 'A', unit: 'kg',
  });
  expect(r.status).toBe(201);
  return r.body as { id: number; name_ar: string };
}

/** A توب entered through the wizard — which also writes its lot + factory_in movement. */
async function addTop(headers: Record<string, string>, fabricId: number) {
  const r = await request(app).post('/api/tops/batch').set(headers).send({
    fabric: { id: fabricId },
    rolls: [{ color: { name_ar: 'أبيض-حذف' }, weight_kg: 25, width_cm: 150 }],
  });
  expect(r.status).toBe(201);
  return r.body.rolls[0] as { id: number };
}

describe('fabric delete — name marking helpers', () => {
  it('marks, detects and strips exactly', () => {
    expect(applyArchiveMark('قطن')).toBe(`قطن${ARCHIVED_SUFFIX}`);
    expect(stripArchiveMark(`قطن${ARCHIVED_SUFFIX}`)).toBe('قطن');
    expect(stripArchiveMark('قطن')).toBe('قطن');
  });

  it('does not double-apply the mark', () => {
    const once = applyArchiveMark('قطن');
    expect(applyArchiveMark(once)).toBe(once);
  });

  it('keeps a max-length name within the varchar(128) column', () => {
    const marked = applyArchiveMark('ط'.repeat(128));
    expect(marked.length).toBeLessThanOrEqual(128);
    expect(marked.endsWith(ARCHIVED_SUFFIX)).toBe(true);
  });
});

describe('fabric delete — outcomes', () => {
  afterAll(async () => {
    if (RUN_DB) await db.destroy();
  });

  it.skipIf(!RUN_DB)('a material with nothing attached is deleted permanently', async () => {
    const headers = await auth();
    const fabric = await createFabric(headers, 'خامة-حذف-فارغة');

    const usage = await request(app).get(`/api/fabrics/${fabric.id}/usage`).set(headers);
    expect(usage.status).toBe(200);
    expect(usage.body.can_hard_delete).toBe(true);
    expect(usage.body.rolls_total).toBe(0);

    const del = await request(app).delete(`/api/fabrics/${fabric.id}`).set(headers);
    expect(del.status).toBe(200);
    expect(del.body.mode).toBe('deleted');

    expect(await db('fabrics').where({ id: fabric.id }).first()).toBeUndefined();
  });

  it.skipIf(!RUN_DB)('a material holding أتواب is archived — physical stock is never swept away', async () => {
    const headers = await auth();
    const fabric = await createFabric(headers, 'خامة-حذف-باتواب');
    const roll = await addTop(headers, fabric.id);

    // The wizard creates the توب plus its automatic factory_in movement.
    expect(await db('stock_movements').where({ roll_id: roll.id }).first()).toBeDefined();

    const usage = await request(app).get(`/api/fabrics/${fabric.id}/usage`).set(headers);
    expect(usage.body.rolls_total).toBe(1);
    expect(usage.body.can_hard_delete).toBe(false);
    expect(usage.body.blockers).toContain('rolls_total');

    const del = await request(app).delete(`/api/fabrics/${fabric.id}`).set(headers);
    expect(del.status).toBe(200);
    expect(del.body.mode).toBe('archived');

    // The توب is a physical roll with a printed label on it. It and its
    // movement trail both survive; only the material is hidden.
    expect(await db('rolls').where({ id: roll.id }).first()).toBeDefined();
    expect(await db('stock_movements').where({ roll_id: roll.id }).first()).toBeDefined();

    const after = await db('fabrics').where({ id: fabric.id }).first();
    expect(after.is_active).toBe(false);
    expect(after.name_ar.endsWith(ARCHIVED_SUFFIX)).toBe(true);
  });

  it.skipIf(!RUN_DB)('adjusting a توب keeps it in stock and findable', async () => {
    const headers = await auth();
    const fabric = await createFabric(headers, 'خامة-تسوية-وزن');
    const roll = await addTop(headers, fabric.id);

    // Exactly the client's flow: a sample was cut, so the weight drops.
    const adj = await request(app).post('/api/adjustments').set(headers).send({
      entity_type: 'roll',
      roll_id: roll.id,
      new_weight_kg: 21.5,
      notes_ar: 'قص عينة',
    });
    expect(adj.status).toBe(201);

    const after = await db('rolls').where({ id: roll.id }).first();
    expect(after).toBeDefined();
    expect(Number(after.weight_kg)).toBe(21.5);
    expect(after.status).toBe('in_stock');

    // Still returned by the الأتواب search, so a new barcode can be printed.
    const found = await request(app).get('/api/rolls/search').set(headers);
    expect(found.body.some((r: { id: number }) => r.id === roll.id)).toBe(true);
  });

  it.skipIf(!RUN_DB)('a توب sent to عيّنة and brought back becomes sellable again', async () => {
    const headers = await auth();
    const fabric = await createFabric(headers, 'خامة-عينة-ورجوع');
    const roll = await addTop(headers, fabric.id);

    const toSample = await request(app).post('/api/adjustments').set(headers).send({
      entity_type: 'roll', roll_id: roll.id, new_status: 'sample', notes_ar: 'عينة للعميل',
    });
    expect(toSample.status).toBe(201);

    // Out of «متاح» ⇒ out of شاشة البيع, and the توب still exists.
    const hidden = await db('rolls').where({ id: roll.id }).first();
    expect(hidden).toBeDefined();
    expect(hidden.status).toBe('sample');
    expect(hidden.is_visible_at_pos).toBe(false);

    const back = await request(app).post('/api/adjustments').set(headers).send({
      entity_type: 'roll', roll_id: roll.id, new_status: 'in_stock', notes_ar: 'رجوع للمخزون',
    });
    expect(back.status).toBe(201);

    // Back to «متاح» must also restore POS visibility, or the توب reads متاح
    // while staying invisible in شاشة البيع.
    const restored = await db('rolls').where({ id: roll.id }).first();
    expect(restored.status).toBe('in_stock');
    expect(restored.is_visible_at_pos).toBe(true);
  });

  it.skipIf(!RUN_DB)('a weight-only تسوية leaves a deliberate POS hide alone', async () => {
    const headers = await auth();
    const fabric = await createFabric(headers, 'خامة-اخفاء-متعمد');
    const roll = await addTop(headers, fabric.id);

    // The user hides an otherwise-متاح توب from شاشة البيع on purpose.
    await request(app).post(`/api/rolls/${roll.id}/toggle-pos-visibility`).set(headers);
    expect((await db('rolls').where({ id: roll.id }).first()).is_visible_at_pos).toBe(false);

    await request(app).post('/api/adjustments').set(headers).send({
      entity_type: 'roll', roll_id: roll.id, new_weight_kg: 20, notes_ar: 'تصحيح وزن',
    });

    const after = await db('rolls').where({ id: roll.id }).first();
    expect(Number(after.weight_kg)).toBe(20);
    expect(after.is_visible_at_pos).toBe(false);
  });

  it.skipIf(!RUN_DB)('a material carrying business history is archived, not erased, and its name is marked', async () => {
    const headers = await auth();
    const fabric = await createFabric(headers, 'خامة-حذف-بسجل');
    const roll = await addTop(headers, fabric.id);

    // Stand in for a sale: a damage event is business history recorded
    // against the توب, and needs no POS/shift setup to create.
    const owner = await db('users').where({ username: OWNER.username }).first();
    await db('damage_events').insert({
      roll_id: roll.id,
      reason_code: 'other',
      disposition: 'auto_writeoff',
      valuation_egp: 0,
      notes_ar: 'اختبار',
      created_by_user_id: owner.id,
    });

    const usage = await request(app).get(`/api/fabrics/${fabric.id}/usage`).set(headers);
    expect(usage.body.can_hard_delete).toBe(false);
    expect(usage.body.blockers).toContain('damage_events');

    const del = await request(app).delete(`/api/fabrics/${fabric.id}`).set(headers);
    expect(del.status).toBe(200);
    expect(del.body.mode).toBe('archived');

    const after = await db('fabrics').where({ id: fabric.id }).first();
    expect(after).toBeDefined();
    expect(after.is_active).toBe(false);
    expect(after.archived_at).not.toBeNull();
    expect(after.name_ar.endsWith(ARCHIVED_SUFFIX)).toBe(true);

    // The توب and its history survive.
    expect(await db('rolls').where({ id: roll.id }).first()).toBeDefined();
    expect(await db('damage_events').where({ roll_id: roll.id }).first()).toBeDefined();

    // Archived materials drop out of the default listing but stay available
    // to historical screens.
    const active = await request(app).get('/api/fabrics').set(headers);
    expect(active.body.some((f: { id: number }) => f.id === fabric.id)).toBe(false);

    const all = await request(app).get('/api/fabrics?archived=all').set(headers);
    expect(all.body.some((f: { id: number }) => f.id === fabric.id)).toBe(true);

    // Restoring undoes the mark exactly.
    const restored = await request(app).post(`/api/fabrics/${fabric.id}/restore`).set(headers);
    expect(restored.status).toBe(200);
    expect(restored.body.is_active).toBe(true);
    expect(restored.body.archived_at).toBeNull();
    expect(restored.body.name_ar).toBe('خامة-حذف-بسجل');
  });

  it.skipIf(!RUN_DB)('toggling «مفعّل» from the edit dialog marks the name too, and editing other fields keeps the archive date', async () => {
    const headers = await auth();
    const fabric = await createFabric(headers, 'خامة-تعطيل-يدوي');

    const off = await request(app).patch(`/api/fabrics/${fabric.id}`).set(headers).send({ is_active: false });
    expect(off.status).toBe(200);
    expect(off.body.name_ar).toBe(`خامة-تعطيل-يدوي${ARCHIVED_SUFFIX}`);
    expect(off.body.archived_at).not.toBeNull();

    // An unrelated edit must not restamp archived_at or double the marker.
    const edited = await request(app).patch(`/api/fabrics/${fabric.id}`).set(headers).send({ notes: 'ملاحظة' });
    expect(edited.body.archived_at).toBe(off.body.archived_at);
    expect(edited.body.name_ar).toBe(`خامة-تعطيل-يدوي${ARCHIVED_SUFFIX}`);

    const on = await request(app).patch(`/api/fabrics/${fabric.id}`).set(headers).send({ is_active: true });
    expect(on.body.name_ar).toBe('خامة-تعطيل-يدوي');
    expect(on.body.archived_at).toBeNull();

    await request(app).delete(`/api/fabrics/${fabric.id}`).set(headers);
  });

  it.skipIf(!RUN_DB)('deleting a missing material reports 404 in Arabic', async () => {
    const headers = await auth();
    const del = await request(app).delete('/api/fabrics/99999999').set(headers);
    expect(del.status).toBe(404);
    expect(del.body.message).toBe('الخامة غير موجودة');
  });
});
