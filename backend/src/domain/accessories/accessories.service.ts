import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import { auditFromService } from '../inventory/audit.helper.js';
import type { CreateAccessoryInput, UpdateAccessoryInput } from './accessories.schemas.js';

export type Accessory = {
  id: number;
  internal_barcode: string;
  name_ar: string;
  qty_in_stock: number;
  selling_price_egp: string | null;
  notes_ar: string | null;
  is_active: boolean;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

async function generateBarcode(trx: Knex.Transaction): Promise<string> {
  const result = await trx.raw<{ rows: Array<{ n: number | string }> }>(
    'UPDATE db_sequences SET last_value = last_value + 1 WHERE name = ? RETURNING last_value AS n',
    ['accessory_barcode_seq'],
  );
  return `RMX-A-${String(Number(result.rows[0].n)).padStart(6, '0')}`;
}

export async function createAccessory(
  input: CreateAccessoryInput,
  actorUserId: number,
): Promise<Accessory> {
  return db.transaction(async (trx) => {
    const internal_barcode = await generateBarcode(trx);

    const [{ id }] = await trx('accessories').insert({
      internal_barcode,
      name_ar: input.name_ar,
      qty_in_stock: input.quantity,
      selling_price_egp: input.selling_price_egp ?? null,
      notes_ar: input.notes_ar ?? null,
      is_active: true,
      created_by_user_id: actorUserId,
    }).returning('id');

    const created = await trx('accessories').where({ id }).first() as Accessory;

    await auditFromService(trx, {
      actorUserId,
      action: 'create_accessory',
      entity: 'accessory',
      entityId: created.id,
      after: {
        id: created.id,
        internal_barcode: created.internal_barcode,
        name_ar: created.name_ar,
        qty_in_stock: created.qty_in_stock,
        selling_price_egp: created.selling_price_egp,
      },
      severity: 'medium',
    });

    return created;
  });
}

export async function listAccessories(opts: {
  q?: string;
  is_active?: boolean;
}): Promise<Accessory[]> {
  let query = db('accessories').orderBy('created_at', 'desc');

  if (opts.is_active !== undefined) {
    query = query.where({ is_active: opts.is_active });
  }

  if (opts.q) {
    const like = `%${opts.q}%`;
    query = query.where('name_ar', 'ilike', like);
  }

  return query as unknown as Accessory[];
}

export async function searchAccessories(q: string): Promise<Accessory[]> {
  const like = `%${q}%`;
  return db('accessories')
    .where({ is_active: true })
    .where('name_ar', 'ilike', like)
    .orderBy('name_ar', 'asc')
    .limit(50) as unknown as Accessory[];
}

export async function getAccessoryByBarcode(barcode: string): Promise<Accessory | null> {
  const row = await db('accessories').where({ internal_barcode: barcode, is_active: true }).first();
  return row ? (row as Accessory) : null;
}

export async function getAccessoryById(id: number): Promise<Accessory | null> {
  const row = await db('accessories').where({ id }).first();
  return row ? (row as Accessory) : null;
}

export async function updateAccessory(
  id: number,
  patch: UpdateAccessoryInput,
  actorUserId: number,
): Promise<Accessory> {
  const before = await db('accessories').where({ id }).first();
  if (!before) throw new Error('ACCESSORY_NOT_FOUND');

  const update: Record<string, unknown> = { updated_at: db.fn.now() };
  if (patch.name_ar !== undefined) update.name_ar = patch.name_ar;
  if (patch.selling_price_egp !== undefined) update.selling_price_egp = patch.selling_price_egp ?? null;
  if (patch.notes_ar !== undefined) update.notes_ar = patch.notes_ar ?? null;
  if (patch.is_active !== undefined) update.is_active = patch.is_active;

  await db('accessories').where({ id }).update(update);
  const after = await db('accessories').where({ id }).first() as Accessory;

  await auditFromService(db, {
    actorUserId,
    action: 'update_accessory',
    entity: 'accessory',
    entityId: id,
    before: {
      name_ar: before.name_ar,
      selling_price_egp: before.selling_price_egp,
      notes_ar: before.notes_ar,
      is_active: before.is_active,
    },
    after: {
      name_ar: after.name_ar,
      selling_price_egp: after.selling_price_egp,
      notes_ar: after.notes_ar,
      is_active: after.is_active,
    },
    severity: 'medium',
  });

  return after;
}
