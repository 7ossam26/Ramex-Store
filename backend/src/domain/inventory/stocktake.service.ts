import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import { auditFromService } from './audit.helper.js';
import { applyRollPatch, type RollChange } from './adjustments.service.js';
import { notify, type NotifyInput } from '../notifications/notificationsService.js';
import type {
  Stocktake,
  StocktakeIssue,
  StocktakeLine,
  StocktakeMode,
  StocktakeResolutionAction,
} from './inventory.types.js';
import type { ResolveStocktakeInput, UpdateStocktakeLineInput } from './inventory.schemas.js';
import type { FabricUnit, RollWarehouse } from '../items/items.types.js';

/**
 * Statuses of a توب that is physically sitting in its warehouse. A جرد
 * expects to find all of them on the shelf — not only «متاح»: محجوز and عيّنة
 * أتواب are still there, and the damaged_shop warehouse holds «تالف» ones.
 */
export const PHYSICAL_STATUSES = ['in_stock', 'reserved', 'sample', 'damaged'] as const;
const PHYSICAL_SQL = PHYSICAL_STATUSES.map((s) => `'${s}'`).join(',');

/**
 * Unresolved issue line of a roll-level count (alias `l`). Must stay in sync
 * with `lineIssue` below.
 */
const UNRESOLVED_ISSUE_SQL = `
  l.resolution IS NULL AND (
    l.line_kind = 'unexpected'
    OR l.actual_count IS NULL
    OR (l.actual_weight_kg IS NOT NULL AND l.actual_weight_kg IS DISTINCT FROM l.expected_weight_kg)
    OR (l.actual_length_m IS NOT NULL AND l.actual_length_m IS DISTINCT FROM l.expected_length_m)
  )`;

/** Domain error that carries the id of the count blocking the request. */
export class StocktakeBlockedError extends Error {
  constructor(code: string, public readonly stocktakeId: number) {
    super(code);
  }
}

export type StocktakeLineDetail = StocktakeLine & {
  internal_barcode: string | null;
  external_barcode: string | null;
  roll_sr_no: string | null;
  top_number: number | null;
  fabric_name_ar: string | null;
  fabric_unit: FabricUnit | null;
  color_name_ar: string | null;
  color_code: string | null;
  current_status: string | null;
  current_warehouse: RollWarehouse | null;
  resolved_by_name_ar: string | null;
  issue: StocktakeIssue | null;
  /** Measured minus system quantity, in the fabric's unit; null when not measured. */
  qty_diff: number | null;
  allowed_actions: StocktakeResolutionAction[];
};

export type StocktakeWithLines = Stocktake & { lines: StocktakeLineDetail[] };

export type StocktakeListRow = Stocktake & {
  total_lines: number;
  scanned_lines: number;
  unexpected_lines: number;
  unresolved_count: number;
};

function num(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function measuredDiff(line: StocktakeLine): number | null {
  const w = num(line.actual_weight_kg);
  if (w !== null) return Number((w - (num(line.expected_weight_kg) ?? 0)).toFixed(3));
  const m = num(line.actual_length_m);
  if (m !== null) return Number((m - (num(line.expected_length_m) ?? 0)).toFixed(3));
  return null;
}

/** What is wrong with a line, regardless of whether it was resolved. */
export function lineIssue(line: StocktakeLine, mode: StocktakeMode): StocktakeIssue | null {
  if (mode === 'aggregate') {
    if (line.actual_count === null) return 'missing';
    const countDiff = Number(line.actual_count) !== Number(line.expected_count ?? 0);
    const diff = measuredDiff(line);
    return countDiff || (diff !== null && diff !== 0) ? 'quantity_diff' : null;
  }
  if (line.line_kind === 'unexpected') return 'unexpected';
  if (line.actual_count === null) return 'missing';
  const diff = measuredDiff(line);
  return diff !== null && diff !== 0 ? 'quantity_diff' : null;
}

export function allowedActions(
  line: StocktakeLine,
  mode: StocktakeMode,
): StocktakeResolutionAction[] {
  if (mode !== 'roll_level') return [];
  switch (lineIssue(line, mode)) {
    case 'missing':
      return ['transfer', 'write_off', 'keep_as_is'];
    case 'unexpected':
      if ((PHYSICAL_STATUSES as readonly string[]).includes(line.system_status ?? '')) {
        return ['transfer', 'keep_as_is'];
      }
      if (line.system_status === 'written_off') return ['restore_to_stock', 'keep_as_is'];
      // Sold / returned-to-supplier أتواب stay as they are: changing them here
      // would contradict an invoice or shipment record.
      return ['keep_as_is'];
    case 'quantity_diff':
      return ['adjust_quantity', 'keep_as_is'];
    default:
      return [];
  }
}

async function lockStocktake(trx: Knex.Transaction, id: number): Promise<Stocktake> {
  const stocktake = await trx('stocktakes').where({ id }).forUpdate().first();
  if (!stocktake) throw new Error('STOCKTAKE_NOT_FOUND');
  return stocktake as Stocktake;
}

async function lockOpenStocktake(trx: Knex.Transaction, id: number): Promise<Stocktake> {
  const stocktake = await lockStocktake(trx, id);
  if (stocktake.status !== 'open') throw new Error('STOCKTAKE_NOT_OPEN');
  return stocktake;
}

export async function startStocktake(
  actorUserId: number,
  mode: StocktakeMode,
  warehouse: RollWarehouse,
  notesAr: string | null = null,
): Promise<Stocktake> {
  return db.transaction(async (trx) => {
    // Serialise starts per warehouse so two clicks can't both pass the checks.
    await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [`stocktake:${warehouse}`]);

    const open = await trx('stocktakes')
      .where({ warehouse, status: 'open' })
      .orderBy('id', 'desc')
      .first('id');
    if (open) throw new StocktakeBlockedError('STOCKTAKE_ALREADY_OPEN', Number(open.id));

    const pending = await trx('stocktakes as s')
      .where({ 's.warehouse': warehouse, 's.status': 'completed', 's.mode': 'roll_level' })
      .whereExists(function () {
        this.select(trx.raw('1'))
          .from('stocktake_lines as l')
          .whereRaw('l.stocktake_id = s.id')
          .whereRaw(UNRESOLVED_ISSUE_SQL);
      })
      .orderBy('s.id', 'desc')
      .first('s.id');
    if (pending) throw new StocktakeBlockedError('STOCKTAKE_PENDING_RESOLUTION', Number(pending.id));

    const placeholder = `STK-PENDING-${Date.now()}-${actorUserId}`;
    const [{ id: createdId }] = await trx('stocktakes').insert({
      stocktake_no: placeholder,
      mode,
      warehouse,
      created_by_user_id: actorUserId,
      started_at: trx.fn.now(),
      status: 'open',
      notes_ar: notesAr,
    }).returning('id');

    const real_no = `STK-${new Date().getFullYear()}-${String(createdId).padStart(6, '0')}`;
    await trx('stocktakes').where({ id: createdId }).update({ stocktake_no: real_no });
    const withNo = await trx('stocktakes').where({ id: createdId }).first();

    if (mode === 'roll_level') {
      await trx.raw(
        `INSERT INTO stocktake_lines (stocktake_id, roll_id, expected_count, expected_weight_kg, expected_length_m)
         SELECT ?, id, 1, weight_kg, length_m FROM rolls
         WHERE warehouse = ? AND status IN (${PHYSICAL_SQL})`,
        [createdId, warehouse],
      );
    } else {
      await trx.raw(
        `INSERT INTO stocktake_lines (stocktake_id, fabric_id, color_id, expected_count, expected_weight_kg, expected_length_m)
         SELECT ?, fabric_id, color_id, COUNT(*), SUM(weight_kg), SUM(length_m) FROM rolls
         WHERE warehouse = ? AND status IN (${PHYSICAL_SQL})
         GROUP BY fabric_id, color_id`,
        [createdId, warehouse],
      );
    }

    await auditFromService(trx, {
      actorUserId,
      action: 'start_stocktake',
      entity: 'stocktake',
      entityId: createdId,
      after: { stocktake_no: real_no, mode, warehouse },
      severity: 'low',
    });

    return withNo as Stocktake;
  });
}

export async function recordScan(
  stocktakeId: number,
  actorUserId: number,
  barcode: string,
): Promise<{ line: StocktakeLineDetail; alreadyScanned: boolean }> {
  const result = await db.transaction(async (trx) => {
    const stocktake = await lockOpenStocktake(trx, stocktakeId);
    if (stocktake.mode !== 'roll_level') throw new Error('SCAN_REQUIRES_ROLL_LEVEL_MODE');

    const roll = await trx('rolls')
      .where('internal_barcode', barcode)
      .orWhere('external_barcode', barcode)
      .first();
    if (!roll) throw new Error('ROLL_NOT_FOUND');

    const line = await trx('stocktake_lines')
      .where({ stocktake_id: stocktakeId, roll_id: roll.id })
      .first();

    if (line && line.actual_count !== null) {
      return { lineId: Number(line.id), alreadyScanned: true };
    }

    let lineId: number;
    if (line) {
      lineId = Number(line.id);
      await trx('stocktake_lines')
        .where({ id: lineId })
        .update({ actual_count: 1, scanned_at: trx.fn.now() });
    } else {
      // Not in the start snapshot. If the system now has it in this warehouse
      // (e.g. received after the count started) it is simply an expected توب;
      // otherwise it is registered somewhere else / in another status and the
      // user decides what to do with it after the count.
      const inPlace =
        roll.warehouse === stocktake.warehouse &&
        (PHYSICAL_STATUSES as readonly string[]).includes(roll.status);
      const [{ id }] = await trx('stocktake_lines').insert({
        stocktake_id: stocktakeId,
        roll_id: roll.id,
        line_kind: inPlace ? 'expected' : 'unexpected',
        expected_count: inPlace ? 1 : 0,
        expected_weight_kg: roll.weight_kg,
        expected_length_m: roll.length_m,
        actual_count: 1,
        scanned_at: trx.fn.now(),
        system_warehouse: roll.warehouse,
        system_status: roll.status,
      }).returning('id');
      lineId = Number(id);
    }

    await auditFromService(trx, {
      actorUserId,
      action: 'stocktake_scan',
      entity: 'stocktake',
      entityId: stocktakeId,
      after: { roll_id: roll.id, internal_barcode: roll.internal_barcode },
      severity: 'low',
    });

    return { lineId, alreadyScanned: false };
  });

  const line = await getLineDetail(stocktakeId, result.lineId);
  return { line: line!, alreadyScanned: result.alreadyScanned };
}

export async function updateLineMeasurement(
  stocktakeId: number,
  lineId: number,
  actorUserId: number,
  input: UpdateStocktakeLineInput,
): Promise<StocktakeLineDetail> {
  await db.transaction(async (trx) => {
    const stocktake = await lockOpenStocktake(trx, stocktakeId);
    if (stocktake.mode !== 'roll_level') throw new Error('SCAN_REQUIRES_ROLL_LEVEL_MODE');
    const line = await trx('stocktake_lines').where({ id: lineId, stocktake_id: stocktakeId }).first();
    if (!line) throw new Error('LINE_NOT_FOUND');
    if (line.actual_count === null) throw new Error('LINE_NOT_SCANNED');

    const patch: Record<string, unknown> = {};
    if (input.actual_weight_kg !== undefined) patch.actual_weight_kg = input.actual_weight_kg;
    if (input.actual_length_m !== undefined) patch.actual_length_m = input.actual_length_m;
    if (Object.keys(patch).length === 0) return;
    await trx('stocktake_lines').where({ id: lineId }).update(patch);

    await auditFromService(trx, {
      actorUserId,
      action: 'stocktake_measure',
      entity: 'stocktake',
      entityId: stocktakeId,
      before: { line_id: lineId, actual_weight_kg: line.actual_weight_kg, actual_length_m: line.actual_length_m },
      after: { line_id: lineId, ...patch },
      severity: 'low',
    });
  });
  return (await getLineDetail(stocktakeId, lineId))!;
}

/** Undo a mis-scan while the count is still open. */
export async function unscanLine(
  stocktakeId: number,
  lineId: number,
  actorUserId: number,
): Promise<void> {
  await db.transaction(async (trx) => {
    const stocktake = await lockOpenStocktake(trx, stocktakeId);
    if (stocktake.mode !== 'roll_level') throw new Error('SCAN_REQUIRES_ROLL_LEVEL_MODE');
    const line = await trx('stocktake_lines').where({ id: lineId, stocktake_id: stocktakeId }).first();
    if (!line) throw new Error('LINE_NOT_FOUND');
    if (line.actual_count === null) throw new Error('LINE_NOT_SCANNED');

    // Lines created by a scan (they carry the system_* snapshot) did not exist
    // in the start snapshot, so undoing the scan removes them entirely.
    if (line.system_warehouse !== null) {
      await trx('stocktake_lines').where({ id: lineId }).delete();
    } else {
      await trx('stocktake_lines').where({ id: lineId }).update({
        actual_count: null,
        actual_weight_kg: null,
        actual_length_m: null,
        scanned_at: null,
      });
    }

    await auditFromService(trx, {
      actorUserId,
      action: 'stocktake_unscan',
      entity: 'stocktake',
      entityId: stocktakeId,
      before: { line_id: lineId, roll_id: line.roll_id },
      severity: 'low',
    });
  });
}

export async function recordAggregate(
  stocktakeId: number,
  actorUserId: number,
  fabricId: number,
  colorId: number,
  actualCount: number,
  actualWeightKg?: number,
): Promise<StocktakeLine> {
  return db.transaction(async (trx) => {
    const stocktake = await lockOpenStocktake(trx, stocktakeId);
    if (stocktake.mode !== 'aggregate') throw new Error('AGGREGATE_REQUIRES_AGGREGATE_MODE');

    let line = await trx('stocktake_lines')
      .where({ stocktake_id: stocktakeId, fabric_id: fabricId, color_id: colorId })
      .first();

    if (!line) {
      const [{ id: insertedId }] = await trx('stocktake_lines').insert({
        stocktake_id: stocktakeId,
        fabric_id: fabricId,
        color_id: colorId,
        expected_count: 0,
        expected_weight_kg: 0,
        actual_count: actualCount,
        actual_weight_kg: actualWeightKg ?? null,
      }).returning('id');
      line = await trx('stocktake_lines').where({ id: insertedId }).first();
    } else {
      // An omitted weight keeps the one already recorded — re-saving only the
      // count must not erase a weight entered earlier.
      const patch: Record<string, unknown> = { actual_count: actualCount };
      if (actualWeightKg !== undefined) patch.actual_weight_kg = actualWeightKg;
      await trx('stocktake_lines').where({ id: line.id }).update(patch);
      line = await trx('stocktake_lines').where({ id: line.id }).first();
    }

    await auditFromService(trx, {
      actorUserId,
      action: 'stocktake_aggregate',
      entity: 'stocktake',
      entityId: stocktakeId,
      after: { fabric_id: fabricId, color_id: colorId, actual_count: actualCount },
      severity: 'low',
    });

    return line as StocktakeLine;
  });
}

export async function completeStocktake(
  stocktakeId: number,
  actorUserId: number,
): Promise<{ stocktake: Stocktake; discrepancyCount: number }> {
  return db.transaction(async (trx) => {
    const stocktake = await lockOpenStocktake(trx, stocktakeId);

    await trx.raw(
      `UPDATE stocktake_lines
       SET variance = COALESCE(actual_count, 0) - COALESCE(expected_count, 0)
       WHERE stocktake_id = ?`,
      [stocktakeId],
    );

    let discrepancyCount: number;
    if (stocktake.mode === 'roll_level') {
      // An unscanned توب that was sold, shipped or moved by the system while
      // the count was running is not missing — the record already explains it.
      await trx.raw(
        `UPDATE stocktake_lines l
         SET resolution = 'changed_during_count', resolved_at = now(), resolved_by_user_id = ?
         FROM rolls r
         WHERE l.roll_id = r.id AND l.stocktake_id = ?
           AND l.actual_count IS NULL AND l.resolution IS NULL
           AND (r.warehouse <> ? OR r.status NOT IN (${PHYSICAL_SQL}))`,
        [actorUserId, stocktakeId, stocktake.warehouse],
      );
      const [row] = await trx('stocktake_lines as l')
        .where('l.stocktake_id', stocktakeId)
        .whereRaw(UNRESOLVED_ISSUE_SQL)
        .count<{ count: string }[]>('* as count');
      discrepancyCount = Number(row?.count ?? 0);
    } else {
      const [row] = await trx('stocktake_lines')
        .where({ stocktake_id: stocktakeId })
        .whereNot('variance', 0)
        .count<{ count: string }[]>('* as count');
      discrepancyCount = Number(row?.count ?? 0);
    }

    await trx('stocktakes').where({ id: stocktakeId }).update({ status: 'completed', completed_at: trx.fn.now() });
    const updated = await trx('stocktakes').where({ id: stocktakeId }).first();

    await auditFromService(trx, {
      actorUserId,
      action: 'complete_stocktake',
      entity: 'stocktake',
      entityId: stocktakeId,
      before: { status: 'open' },
      after: { status: 'completed', discrepancy_lines: discrepancyCount },
      severity: discrepancyCount > 0 ? 'medium' : 'low',
    });

    if (discrepancyCount > 0) {
      await notify({
        recipientRole: 'shop_seller',
        severity: 'medium',
        eventType: 'stock_adjustment',
        titleAr: 'جرد: تعديلات مقترحة',
        bodyAr: `جرد رقم ${updated.stocktake_no} يحتوي على ${discrepancyCount} سطر بفوارق`,
        payload: {
          stocktake_id: stocktakeId,
          stocktake_no: updated.stocktake_no,
          discrepancy_lines: discrepancyCount,
        },
      });
    }

    return { stocktake: updated as Stocktake, discrepancyCount };
  });
}

export async function cancelStocktake(stocktakeId: number, actorUserId: number): Promise<Stocktake> {
  return db.transaction(async (trx) => {
    await lockOpenStocktake(trx, stocktakeId);
    await trx('stocktakes').where({ id: stocktakeId }).update({ status: 'cancelled' });
    const updated = await trx('stocktakes').where({ id: stocktakeId }).first();
    await auditFromService(trx, {
      actorUserId,
      action: 'cancel_stocktake',
      entity: 'stocktake',
      entityId: stocktakeId,
      before: { status: 'open' },
      after: { status: 'cancelled' },
      severity: 'medium',
    });
    return updated as Stocktake;
  });
}

const RESOLUTION_LABEL_AR: Record<StocktakeResolutionAction, string> = {
  transfer: 'نقل لمخزن آخر',
  write_off: 'شطب',
  adjust_quantity: 'تعديل الكمية',
  restore_to_stock: 'إعادة للمخزون',
  keep_as_is: 'إبقاء كما هو',
};

export async function resolveStocktakeLines(
  stocktakeId: number,
  actorUserId: number,
  items: ResolveStocktakeInput['items'],
): Promise<StocktakeWithLines> {
  const ids = items.map((i) => i.line_id);
  if (new Set(ids).size !== ids.length) throw new Error('DUPLICATE_LINE');

  const notifications: NotifyInput[] = [];

  await db.transaction(async (trx) => {
    const stocktake = await lockStocktake(trx, stocktakeId);
    if (stocktake.status !== 'completed') throw new Error('STOCKTAKE_NOT_COMPLETED');
    if (stocktake.mode !== 'roll_level') throw new Error('RESOLUTION_REQUIRES_ROLL_LEVEL');

    for (const item of items) {
      const line = await trx('stocktake_lines')
        .where({ id: item.line_id, stocktake_id: stocktakeId })
        .forUpdate()
        .first() as StocktakeLine | undefined;
      if (!line) throw new Error('LINE_NOT_FOUND');
      if (line.resolution !== null) throw new Error('LINE_ALREADY_RESOLVED');

      const issue = lineIssue(line, stocktake.mode);
      if (!allowedActions(line, stocktake.mode).includes(item.action)) {
        throw new Error('ACTION_NOT_ALLOWED');
      }
      const notes = item.notes_ar?.trim() || null;
      if (item.action === 'keep_as_is' && !notes) throw new Error('NOTES_REQUIRED');

      const roll = await trx('rolls').where({ id: line.roll_id }).forUpdate().first();
      if (!roll) throw new Error('ROLL_NOT_FOUND');
      const fabric = await trx('fabrics').where({ id: roll.fabric_id }).first('unit');

      // The decision was made against the state shown on screen; refuse it if
      // the توب has been changed since (sold, moved, resolved elsewhere…).
      const isPhysicalHere =
        roll.warehouse === stocktake.warehouse &&
        (PHYSICAL_STATUSES as readonly string[]).includes(roll.status);
      const stale = issue === 'unexpected'
        ? roll.warehouse !== line.system_warehouse || roll.status !== line.system_status
        : !isPhysicalHere;
      if (stale) throw new Error('LINE_STALE');

      // Measured quantity, applied whenever the توب's record is put right.
      const measured: RollChange = {};
      if (fabric?.unit === 'meter') {
        if (line.actual_length_m !== null) measured.length_m = Number(line.actual_length_m);
      } else if (line.actual_weight_kg !== null) {
        measured.weight_kg = Number(line.actual_weight_kg);
      }

      let targetWarehouse: RollWarehouse | null = null;
      let change: RollChange | null = null;
      let eventType: 'adjustment' | 'loss_writeoff' = 'adjustment';
      let severity: 'medium' | 'high' | 'critical' = 'medium';

      switch (item.action) {
        case 'transfer':
          if (issue === 'missing') {
            if (!item.target_warehouse) throw new Error('TARGET_WAREHOUSE_REQUIRED');
            if (item.target_warehouse === stocktake.warehouse) throw new Error('INVALID_TARGET_WAREHOUSE');
            targetWarehouse = item.target_warehouse;
            change = { warehouse: targetWarehouse };
          } else {
            targetWarehouse = stocktake.warehouse;
            change = { warehouse: targetWarehouse, ...measured };
          }
          break;
        case 'write_off':
          change = { status: 'written_off' };
          eventType = 'loss_writeoff';
          severity = 'critical';
          break;
        case 'adjust_quantity':
          if (Object.keys(measured).length === 0) throw new Error('ACTION_NOT_ALLOWED');
          change = measured;
          break;
        case 'restore_to_stock':
          targetWarehouse = stocktake.warehouse;
          change = {
            warehouse: targetWarehouse,
            status: stocktake.warehouse === 'damaged_shop' ? 'damaged' : 'in_stock',
            ...measured,
          };
          severity = 'critical';
          break;
        case 'keep_as_is':
          break;
      }

      const auditExtra = {
        stocktake_id: stocktakeId,
        stocktake_no: stocktake.stocktake_no,
        line_id: line.id,
        issue,
        resolution: item.action,
      };

      if (change) {
        // Note: a transfer may move a factory توب's record without a shipment.
        // This corrects the record to match a physical count; it does not move
        // goods, and the audit entry says so via `resolution`.
        await applyRollPatch(trx, actorUserId, roll, change, {
          eventType,
          referenceType: 'stocktake',
          referenceId: stocktakeId,
          notesAr: notes ?? `جرد ${stocktake.stocktake_no}: ${RESOLUTION_LABEL_AR[item.action]}`,
          auditAction: 'stocktake_resolve',
          severity,
          auditExtra,
        });
      } else {
        await auditFromService(trx, {
          actorUserId,
          action: 'stocktake_resolve',
          entity: 'roll',
          entityId: roll.id,
          after: { ...auditExtra, notes_ar: notes, roll_status: roll.status, roll_warehouse: roll.warehouse },
          severity: 'medium',
        });
      }

      await trx('stocktake_lines').where({ id: line.id }).update({
        resolution: item.action,
        resolution_target_warehouse: targetWarehouse,
        resolution_notes_ar: notes,
        resolved_by_user_id: actorUserId,
        resolved_at: trx.fn.now(),
      });

      const rollLabel = roll.internal_barcode ?? `#${roll.id}`;
      if (item.action === 'write_off') {
        notifications.push({
          recipientRole: 'owner',
          severity: 'high',
          eventType: 'stock_adjustment',
          titleAr: 'جرد: شطب توب',
          bodyAr: `تم شطب التوب ${rollLabel} لعدم وجوده في جرد ${stocktake.stocktake_no}`,
          payload: { stocktake_id: stocktakeId, roll_id: roll.id, notes_ar: notes },
        });
      } else if (item.action === 'restore_to_stock') {
        notifications.push({
          recipientRole: 'owner',
          severity: 'high',
          eventType: 'stock_adjustment',
          titleAr: 'جرد: إعادة توب مشطوب للمخزون',
          bodyAr: `تم العثور على التوب المشطوب ${rollLabel} في جرد ${stocktake.stocktake_no} وإعادته للمخزون`,
          payload: { stocktake_id: stocktakeId, roll_id: roll.id, notes_ar: notes },
        });
      } else if (item.action === 'keep_as_is' && issue === 'unexpected') {
        notifications.push({
          recipientRole: 'owner',
          severity: 'medium',
          eventType: 'stock_adjustment',
          titleAr: 'جرد: توب موجود رغم حالته في النظام',
          bodyAr: `التوب ${rollLabel} موجود فعلياً في جرد ${stocktake.stocktake_no} بينما حالته في النظام «${roll.status}»`,
          payload: { stocktake_id: stocktakeId, roll_id: roll.id, roll_status: roll.status, notes_ar: notes },
        });
      }
    }
  });

  // Sent only once the resolutions are committed.
  for (const n of notifications) await notify(n);

  return (await getStocktake(stocktakeId))!;
}

export async function listStocktakes(): Promise<StocktakeListRow[]> {
  const rows = await db('stocktakes as s')
    .select(
      's.*',
      db.raw(`(SELECT COUNT(*) FROM stocktake_lines l
               WHERE l.stocktake_id = s.id AND l.line_kind = 'expected')::int AS total_lines`),
      db.raw(`(SELECT COUNT(*) FROM stocktake_lines l
               WHERE l.stocktake_id = s.id AND l.line_kind = 'expected'
                 AND l.actual_count IS NOT NULL)::int AS scanned_lines`),
      db.raw(`(SELECT COUNT(*) FROM stocktake_lines l
               WHERE l.stocktake_id = s.id AND l.line_kind = 'unexpected')::int AS unexpected_lines`),
      db.raw(`CASE WHEN s.status = 'completed' AND s.mode = 'roll_level' THEN
                (SELECT COUNT(*) FROM stocktake_lines l
                 WHERE l.stocktake_id = s.id AND ${UNRESOLVED_ISSUE_SQL})::int
              ELSE 0 END AS unresolved_count`),
    )
    .orderBy('s.id', 'desc');
  return rows as StocktakeListRow[];
}

function linesQuery(conn: typeof db) {
  return conn('stocktake_lines as l')
    .leftJoin('rolls as r', 'l.roll_id', 'r.id')
    .leftJoin('fabrics as f', function () {
      this.on('f.id', '=', conn.raw('COALESCE(l.fabric_id, r.fabric_id)'));
    })
    .leftJoin('colors as c', function () {
      this.on('c.id', '=', conn.raw('COALESCE(l.color_id, r.color_id)'));
    })
    .leftJoin('users as u', 'l.resolved_by_user_id', 'u.id')
    .select(
      'l.*',
      'r.internal_barcode',
      'r.external_barcode',
      'r.roll_sr_no',
      'r.top_number',
      'r.status as current_status',
      'r.warehouse as current_warehouse',
      'f.name_ar as fabric_name_ar',
      'f.unit as fabric_unit',
      'c.name_ar as color_name_ar',
      'c.code as color_code',
      'u.full_name_ar as resolved_by_name_ar',
    );
}

function decorate(row: StocktakeLineDetail, mode: StocktakeMode): StocktakeLineDetail {
  return {
    ...row,
    issue: lineIssue(row, mode),
    qty_diff: measuredDiff(row),
    allowed_actions: row.resolution === null ? allowedActions(row, mode) : [],
  };
}

async function getLineDetail(stocktakeId: number, lineId: number): Promise<StocktakeLineDetail | undefined> {
  const stocktake = await db('stocktakes').where({ id: stocktakeId }).first('mode');
  const row = await linesQuery(db).where('l.id', lineId).first();
  if (!stocktake || !row) return undefined;
  return decorate(row as StocktakeLineDetail, stocktake.mode);
}

export async function getStocktake(id: number): Promise<StocktakeWithLines | undefined> {
  const header = await db('stocktakes').where({ id }).first();
  if (!header) return undefined;
  const rows = await linesQuery(db).where('l.stocktake_id', id).orderBy('l.id', 'asc');
  const lines = (rows as StocktakeLineDetail[]).map((r) => decorate(r, header.mode));
  return { ...(header as Stocktake), lines };
}
