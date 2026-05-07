import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import { auditFromService } from './audit.helper.js';
import { notify } from './notifications.service.js';
import type {
  Stocktake,
  StocktakeLine,
  StocktakeMode,
} from './inventory.types.js';
import type { RollWarehouse } from '../items/items.types.js';

export type StocktakeWithLines = Stocktake & { lines: StocktakeLine[] };

export async function startStocktake(
  actorUserId: number,
  mode: StocktakeMode,
  warehouse: RollWarehouse,
  notesAr: string | null = null,
): Promise<Stocktake> {
  return db.transaction(async (trx) => {
    // Insert with a placeholder, then patch with the canonical number derived from id.
    const placeholder = `STK-PENDING-${Date.now()}-${actorUserId}`;
    const [created] = await trx('stocktakes')
      .insert({
        stocktake_no: placeholder,
        mode,
        warehouse,
        created_by_user_id: actorUserId,
        started_at: trx.fn.now(),
        status: 'open',
        notes_ar: notesAr,
      })
      .returning('*');

    const real_no = `STK-${new Date().getFullYear()}-${String(created.id).padStart(6, '0')}`;
    const [withNo] = await trx('stocktakes')
      .where({ id: created.id })
      .update({ stocktake_no: real_no })
      .returning('*');

    if (mode === 'roll_level') {
      await trx.raw(
        `INSERT INTO stocktake_lines (stocktake_id, roll_id, expected_count, expected_weight_kg)
         SELECT ?, id, 1, weight_kg FROM rolls
         WHERE warehouse = ? AND status = 'in_stock'`,
        [created.id, warehouse],
      );
    } else {
      await trx.raw(
        `INSERT INTO stocktake_lines (stocktake_id, fabric_id, color_id, expected_count, expected_weight_kg)
         SELECT ?, fabric_id, color_id, COUNT(*)::int, SUM(weight_kg) FROM rolls
         WHERE warehouse = ? AND status = 'in_stock'
         GROUP BY fabric_id, color_id`,
        [created.id, warehouse],
      );
    }

    await auditFromService(trx, {
      actorUserId,
      action: 'start_stocktake',
      entity: 'stocktake',
      entityId: created.id,
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
): Promise<{ line: StocktakeLine; alreadyScanned: boolean }> {
  return db.transaction(async (trx) => {
    const stocktake = await trx('stocktakes').where({ id: stocktakeId }).first();
    if (!stocktake) throw new Error('STOCKTAKE_NOT_FOUND');
    if (stocktake.status !== 'open') throw new Error('STOCKTAKE_NOT_OPEN');
    if (stocktake.mode !== 'roll_level') throw new Error('SCAN_REQUIRES_ROLL_LEVEL_MODE');

    const roll = await trx('rolls')
      .where('internal_barcode', barcode)
      .orWhere('external_barcode', barcode)
      .first();
    if (!roll) throw new Error('ROLL_NOT_FOUND');

    const line = await trx('stocktake_lines')
      .where({ stocktake_id: stocktakeId, roll_id: roll.id })
      .first();
    if (!line) throw new Error('ROLL_NOT_IN_STOCKTAKE');

    const alreadyScanned = line.actual_count !== null;
    if (alreadyScanned) return { line: line as StocktakeLine, alreadyScanned: true };

    const [updated] = await trx('stocktake_lines')
      .where({ id: line.id })
      .update({ actual_count: 1, actual_weight_kg: roll.weight_kg })
      .returning('*');

    await auditFromService(trx, {
      actorUserId,
      action: 'stocktake_scan',
      entity: 'stocktake',
      entityId: stocktakeId,
      after: { roll_id: roll.id, internal_barcode: roll.internal_barcode },
      severity: 'low',
    });

    return { line: updated as StocktakeLine, alreadyScanned: false };
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
    const stocktake = await trx('stocktakes').where({ id: stocktakeId }).first();
    if (!stocktake) throw new Error('STOCKTAKE_NOT_FOUND');
    if (stocktake.status !== 'open') throw new Error('STOCKTAKE_NOT_OPEN');
    if (stocktake.mode !== 'aggregate') throw new Error('AGGREGATE_REQUIRES_AGGREGATE_MODE');

    let line = await trx('stocktake_lines')
      .where({ stocktake_id: stocktakeId, fabric_id: fabricId, color_id: colorId })
      .first();

    if (!line) {
      // Counted a fabric/color combination that had zero expected — insert with expected=0.
      const [inserted] = await trx('stocktake_lines')
        .insert({
          stocktake_id: stocktakeId,
          fabric_id: fabricId,
          color_id: colorId,
          expected_count: 0,
          expected_weight_kg: 0,
          actual_count: actualCount,
          actual_weight_kg: actualWeightKg ?? null,
        })
        .returning('*');
      line = inserted;
    } else {
      const [updated] = await trx('stocktake_lines')
        .where({ id: line.id })
        .update({
          actual_count: actualCount,
          actual_weight_kg: actualWeightKg ?? null,
        })
        .returning('*');
      line = updated;
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
    const stocktake = await trx('stocktakes').where({ id: stocktakeId }).first();
    if (!stocktake) throw new Error('STOCKTAKE_NOT_FOUND');
    if (stocktake.status !== 'open') throw new Error('STOCKTAKE_NOT_OPEN');

    // For roll-level: any unscanned (actual_count IS NULL) line ⇒ variance = -expected.
    // For aggregate: actual_count missing ⇒ variance NULL (treated as discrepancy too).
    if (stocktake.mode === 'roll_level') {
      await trx.raw(
        `UPDATE stocktake_lines
         SET variance = COALESCE(actual_count, 0) - COALESCE(expected_count, 0)
         WHERE stocktake_id = ?`,
        [stocktakeId],
      );
    } else {
      await trx.raw(
        `UPDATE stocktake_lines
         SET variance = COALESCE(actual_count, 0) - COALESCE(expected_count, 0)
         WHERE stocktake_id = ?`,
        [stocktakeId],
      );
    }

    const [discrepancy] = await trx('stocktake_lines')
      .where({ stocktake_id: stocktakeId })
      .whereNot('variance', 0)
      .count<{ count: string }[]>('* as count');
    const discrepancyCount = Number(discrepancy?.count ?? 0);

    const [updated] = await trx('stocktakes')
      .where({ id: stocktakeId })
      .update({ status: 'completed', completed_at: trx.fn.now() })
      .returning('*');

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
      await notify({ role: 'shop_seller' }, 'medium', 'stocktake_adjustment_suggested', {
        stocktake_id: stocktakeId,
        stocktake_no: updated.stocktake_no,
        discrepancy_lines: discrepancyCount,
      });
    }

    return { stocktake: updated as Stocktake, discrepancyCount };
  });
}

export async function listStocktakes(): Promise<Stocktake[]> {
  return db('stocktakes').orderBy('id', 'desc');
}

export async function getStocktake(id: number): Promise<StocktakeWithLines | undefined> {
  const header = await db('stocktakes').where({ id }).first();
  if (!header) return undefined;
  const lines = await db('stocktake_lines').where({ stocktake_id: id }).orderBy('id', 'asc');
  return { ...(header as Stocktake), lines: lines as StocktakeLine[] };
}
