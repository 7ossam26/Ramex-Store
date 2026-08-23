import { db } from '../../db/connection.js';
import type { Knex } from 'knex';
import type { Fabric } from './items.types.js';
import type { CreateFabricInput, UpdateFabricInput } from './items.schemas.js';
import { auditFromService } from '../inventory/audit.helper.js';

/**
 * Suffix appended to an archived material's name.
 *
 * An archived material still shows up in historical screens, invoices,
 * printouts, exports and reports — roughly two dozen backend queries join
 * `fabrics` and render `name_ar`. Marking the stored name (rather than
 * badging each surface) makes the archived state visible in all of them by
 * construction, so no screen can silently show a "deleted" material as if it
 * were still live.
 */
const ARCHIVED_SUFFIX = ' (مؤرشف)';

/** `name_ar` is varchar(128); leave room for the suffix. */
const NAME_MAX = 128;

export function isArchiveMarked(name: string): boolean {
  return name.endsWith(ARCHIVED_SUFFIX);
}

export function applyArchiveMark(name: string): string {
  if (isArchiveMarked(name)) return name;
  return name.slice(0, NAME_MAX - ARCHIVED_SUFFIX.length) + ARCHIVED_SUFFIX;
}

export function stripArchiveMark(name: string): string {
  return isArchiveMarked(name) ? name.slice(0, -ARCHIVED_SUFFIX.length) : name;
}

export { ARCHIVED_SUFFIX };

async function generateFabricCode(trx?: Knex.Transaction): Promise<string> {
  const runner = trx ?? db;
  const result = await (runner as Knex).raw<{ rows: Array<{ n: number | string }> }>(
    'UPDATE db_sequences SET last_value = last_value + 1 WHERE name = ? RETURNING last_value AS n',
    ['fabric_code_seq'],
  );
  return `M-${String(Number(result.rows[0].n)).padStart(6, '0')}`;
}

export { generateFabricCode };

/**
 * `archived` mirrors the `activeFilter` convention used by the codes module
 * (see codes.service.ts `listCodes`). It defaults to 'false' so every picker
 * that calls this without arguments — AddTop, Stocktake, CreateShipment —
 * stops offering archived materials for new entry, at the source.
 */
export async function listFabrics(archived: 'true' | 'false' | 'all' = 'false'): Promise<Fabric[]> {
  const q = db('fabrics').orderBy('code');
  if (archived === 'true') q.where('is_active', false);
  if (archived === 'false') q.where('is_active', true);
  return q;
}

export async function getFabric(id: number): Promise<Fabric | undefined> {
  return db('fabrics').where({ id }).first();
}

export async function createFabric(data: CreateFabricInput): Promise<Fabric> {
  const code = await generateFabricCode();
  const [{ id }] = await db('fabrics')
    .insert({ ...data, code })
    .returning('id');
  return db('fabrics').where({ id }).first() as Promise<Fabric>;
}

export async function updateFabric(id: number, data: UpdateFabricInput): Promise<Fabric | undefined> {
  const current = await db('fabrics').where({ id }).first();
  if (!current) return undefined;

  const patch: Record<string, unknown> = { ...data, updated_at: db.fn.now() };

  // Keep the archive mark in sync with `is_active`. The edit dialog can toggle
  // «مفعّل» directly, and an archived material can be renamed — without this,
  // either path could leave a hidden material whose name looks perfectly
  // normal wherever it still appears.
  const nextActive = data.is_active ?? (current.is_active as boolean);
  const name = (data.name_ar as string | undefined) ?? (current.name_ar as string);

  patch.name_ar = nextActive ? stripArchiveMark(name) : applyArchiveMark(name);

  // Only stamp on an actual transition, so editing an archived material's
  // other fields doesn't reset the date it was archived.
  if (nextActive !== current.is_active) {
    patch.archived_at = nextActive ? null : db.fn.now();
  }

  await db('fabrics').where({ id }).update(patch);
  return db('fabrics').where({ id }).first();
}

/**
 * What stops a material from being erased.
 *
 * `rolls_total` comes first because a توب is not a database row that happens
 * to reference this material — it is a physical roll on a shelf with a printed
 * barcode label on it. Erasing a material must never make stock the shop is
 * still holding disappear, so the existence of even one توب forces the archive
 * path. Permanent delete is therefore reserved for a material with no أتواب at
 * all: the mistyped-entry case, which is the one it is actually needed for.
 *
 * The rest are tables holding business history reached through a توب —
 * deleting them would rewrite past invoices, shipments, loss records or
 * stocktakes. They stay listed separately so the dialog can tell the user
 * precisely which kind of history is holding the material.
 *
 * `stock_movements` needs no entry: it hangs off a توب, so `rolls_total`
 * already covers every case that could reach it.
 */
export type FabricBlocker =
  | 'rolls_total'
  | 'invoice_lines'
  | 'return_lines'
  | 'shipment_lines'
  | 'damage_events'
  | 'stocktake_lines';

export type FabricUsage = {
  rolls_total: number;
  rolls_by_status: Record<string, number>;
  lots: number;
  prices: number;
  stock_movements: number;
  invoice_lines: number;
  return_lines: number;
  shipment_lines: number;
  damage_events: number;
  stocktake_lines: number;
  blockers: FabricBlocker[];
  can_hard_delete: boolean;
};

async function countLinkedToRolls(
  runner: Knex | Knex.Transaction,
  table: string,
  fabricId: number,
): Promise<number> {
  const row = await runner(table)
    .whereIn('roll_id', runner('rolls').select('id').where({ fabric_id: fabricId }))
    .count<{ n: string }[]>({ n: '*' })
    .first();
  return Number(row?.n ?? 0);
}

async function countWhere(
  runner: Knex | Knex.Transaction,
  table: string,
  where: Record<string, unknown>,
): Promise<number> {
  const row = await runner(table).where(where).count<{ n: string }[]>({ n: '*' }).first();
  return Number(row?.n ?? 0);
}

/**
 * A جرد line can name the material directly (`fabric_id`) or reach it through
 * a توب (`roll_id`), and may do both — so count matching lines once, rather
 * than adding two overlapping totals.
 */
async function countStocktakeLines(
  runner: Knex | Knex.Transaction,
  fabricId: number,
): Promise<number> {
  const row = await runner('stocktake_lines')
    .where((b) =>
      b.where({ fabric_id: fabricId }).orWhereIn(
        'roll_id',
        runner('rolls').select('id').where({ fabric_id: fabricId }),
      ),
    )
    .count<{ n: string }[]>({ n: '*' })
    .first();
  return Number(row?.n ?? 0);
}

export async function getFabricUsage(
  id: number,
  runner: Knex | Knex.Transaction = db,
): Promise<FabricUsage> {
  const [
    rollRows,
    lots,
    prices,
    stockMovements,
    invoiceLines,
    returnLines,
    shipmentLines,
    damageEvents,
    stocktakeLines,
  ] = await Promise.all([
    runner('rolls').where({ fabric_id: id }).select('status').count<{ status: string; n: string }[]>({ n: '*' }).groupBy('status'),
    countWhere(runner, 'lots', { fabric_id: id }),
    countWhere(runner, 'fabric_color_prices', { fabric_id: id }),
    countLinkedToRolls(runner, 'stock_movements', id),
    countLinkedToRolls(runner, 'invoice_lines', id),
    countLinkedToRolls(runner, 'return_lines', id),
    countLinkedToRolls(runner, 'shipment_lines', id),
    countLinkedToRolls(runner, 'damage_events', id),
    countStocktakeLines(runner, id),
  ]);

  const rolls_by_status: Record<string, number> = {};
  let rolls_total = 0;
  for (const r of rollRows) {
    const n = Number(r.n);
    rolls_by_status[r.status] = n;
    rolls_total += n;
  }

  const counts = {
    invoice_lines: invoiceLines,
    return_lines: returnLines,
    shipment_lines: shipmentLines,
    damage_events: damageEvents,
    stocktake_lines: stocktakeLines,
  };

  // `rolls_total` leads the list so the dialog names the most likely reason
  // first: for a material still holding stock, "it has أتواب" is the answer,
  // not whichever history table happens to also match.
  const blockers = ([
    ['rolls_total', rolls_total],
    ...(Object.entries(counts) as Array<[FabricBlocker, number]>),
  ] as Array<[FabricBlocker, number]>)
    .filter(([, n]) => n > 0)
    .map(([k]) => k);

  return {
    rolls_total,
    rolls_by_status,
    lots,
    prices,
    stock_movements: stockMovements,
    ...counts,
    blockers,
    can_hard_delete: blockers.length === 0,
  };
}

export type DeleteFabricResult =
  | { mode: 'deleted'; usage: FabricUsage }
  | { mode: 'archived'; usage: FabricUsage };

/**
 * Who is performing the change. `ip`/`userAgent` are carried through so the
 * audit row written inside the transaction still records the caller, the way
 * middleware/audit.ts does for non-transactional writes.
 */
export type FabricActor = { userId: number; ip?: string | null; userAgent?: string | null };

/**
 * Remove a material: erase it permanently when nothing real is attached,
 * otherwise archive it (hidden from new-entry pickers, name marked «مؤرشف»
 * everywhere it still appears). Never fails because the material is "in use".
 */
export async function deleteFabric(id: number, actor: FabricActor): Promise<DeleteFabricResult> {
  return db.transaction(async (trx) => {
    // Lock the row so a concurrent توب entry can't slip in between the usage
    // check and the delete.
    const fabric = await trx('fabrics').where({ id }).forUpdate().first();
    if (!fabric) throw new Error('FABRIC_NOT_FOUND');

    const usage = await getFabricUsage(id, trx);

    if (usage.can_hard_delete) {
      // `rolls_total` is a blocker, so reaching here means the material has no
      // أتواب — and therefore no stock movements, which only exist per توب.
      // Nothing sweeps away physical stock or its ledger: the `RESTRICT` foreign
      // keys on `rolls` stay intact and would refuse the delete if that changed.
      await trx('lots').where({ fabric_id: id }).delete();
      await trx('fabric_color_prices').where({ fabric_id: id }).delete();
      await trx('fabrics').where({ id }).delete();

      await auditFromService(trx, {
        actorUserId: actor.userId,
        ip: actor.ip,
        userAgent: actor.userAgent,
        action: 'delete_fabric',
        entity: 'fabric',
        entityId: id,
        before: fabric,
        after: { mode: 'deleted', swept: usage },
        severity: 'medium',
      });

      return { mode: 'deleted', usage } as const;
    }

    await trx('fabrics').where({ id }).update({
      is_active: false,
      archived_at: trx.fn.now(),
      name_ar: applyArchiveMark(fabric.name_ar as string),
      updated_at: trx.fn.now(),
    });

    await auditFromService(trx, {
      actorUserId: actor.userId,
      ip: actor.ip,
      userAgent: actor.userAgent,
      action: 'archive_fabric',
      entity: 'fabric',
      entityId: id,
      before: fabric,
      after: { mode: 'archived', blockers: usage.blockers, usage },
      severity: 'medium',
    });

    return { mode: 'archived', usage } as const;
  });
}

export async function restoreFabric(id: number, actor: FabricActor): Promise<Fabric> {
  return db.transaction(async (trx) => {
    const fabric = await trx('fabrics').where({ id }).forUpdate().first();
    if (!fabric) throw new Error('FABRIC_NOT_FOUND');

    await trx('fabrics').where({ id }).update({
      is_active: true,
      archived_at: null,
      name_ar: stripArchiveMark(fabric.name_ar as string),
      updated_at: trx.fn.now(),
    });

    const after = await trx('fabrics').where({ id }).first();

    await auditFromService(trx, {
      actorUserId: actor.userId,
      ip: actor.ip,
      userAgent: actor.userAgent,
      action: 'restore_fabric',
      entity: 'fabric',
      entityId: id,
      before: fabric,
      after,
      severity: 'medium',
    });

    return after as Fabric;
  });
}
