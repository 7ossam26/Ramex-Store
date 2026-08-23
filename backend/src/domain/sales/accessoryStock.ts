import type { Knex } from 'knex';
import { auditFromService } from '../inventory/audit.helper.js';

export type InvoiceAccessoryLine = {
  /** invoice_lines.id — lets callers skip a line that was already returned. */
  lineId: number;
  accessoryId: number;
  qtyPieces: number;
};

/** Row shape selected by `splitInvoiceLines` / the void flow. */
type RawInvoiceLine = {
  id: number | string;
  item_type: string | null;
  roll_id: number | string | null;
  accessory_id: number | string | null;
  qty_pieces: number | string | null;
};

/**
 * Split invoice lines into roll ids and accessory lines.
 *
 * Since migration 082 an accessory line carries `roll_id = NULL`, and migration
 * 093's `chk_stock_movements_entity_type` rejects a stock_movements row with
 * `entity_type='roll'` and a NULL `roll_id`. Feeding a NULL into a roll loop is
 * therefore a guaranteed 23514, which the global error handler flattens into
 * «القيمة المُدخلة غير مسموح بها» — the bug this helper exists to prevent.
 *
 * `item_type` defaults to 'roll' (migration 082), so pre-082 rows land in the
 * roll bucket correctly.
 */
export function splitInvoiceLines(lines: RawInvoiceLine[]): {
  rollIds: number[];
  accessoryLines: InvoiceAccessoryLine[];
} {
  const rollIds = lines
    .filter((l) => l.item_type !== 'accessory' && l.roll_id != null)
    .map((l) => Number(l.roll_id));

  const accessoryLines = lines
    .filter((l) => l.item_type === 'accessory' && l.accessory_id != null)
    .map((l) => ({
      lineId: Number(l.id),
      accessoryId: Number(l.accessory_id),
      qtyPieces: Number(l.qty_pieces ?? 0),
    }));

  return { rollIds, accessoryLines };
}

/** Row-lock the accessories referenced by these lines, ascending by id. */
export async function lockAccessories(
  trx: Knex.Transaction,
  accessoryLines: InvoiceAccessoryLine[],
): Promise<void> {
  if (accessoryLines.length === 0) return;
  const ids = [...new Set(accessoryLines.map((a) => a.accessoryId))].sort((a, b) => a - b);
  await trx('accessories').whereIn('id', ids).orderBy('id', 'asc').forUpdate().select('id');
}

/**
 * Give accessory pieces back to stock and audit each line.
 *
 * Deliberately writes NO `stock_movements` row. `createSale` (invoices.service
 * step 9b) decrements `qty_in_stock` with only an audit entry, and both return
 * flows restore it the same way. Emitting a movement only on cancellation would
 * put an `unreserve` count in the daily/shift reports with no matching
 * `sale_out`, and `listStockMovements` inner-joins `rolls` so the row would be
 * invisible there anyway.
 *
 * Rows must already be locked (see `lockAccessories`). Re-reads per line so the
 * same SKU appearing on two lines produces truthful chained before/after values.
 */
export async function restoreAccessoryStock(
  trx: Knex.Transaction,
  accessoryLines: InvoiceAccessoryLine[],
  actorUserId: number,
  ctx: {
    action: string;
    invoiceId: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    extra?: Record<string, unknown>;
  },
): Promise<void> {
  for (const line of accessoryLines) {
    const acc = await trx('accessories').where({ id: line.accessoryId }).first();
    if (!acc) throw new Error('ACCESSORY_NOT_FOUND');
    await trx('accessories')
      .where({ id: line.accessoryId })
      .update({
        qty_in_stock: trx.raw('qty_in_stock + ?', [line.qtyPieces]),
        updated_at: trx.fn.now(),
      });
    await auditFromService(trx, {
      actorUserId,
      action: ctx.action,
      entity: 'accessory',
      entityId: line.accessoryId,
      before: { qty_in_stock: Number(acc.qty_in_stock) },
      after: {
        qty_in_stock: Number(acc.qty_in_stock) + line.qtyPieces,
        invoice_id: ctx.invoiceId,
        invoice_line_id: line.lineId,
        qty_pieces: line.qtyPieces,
        ...(ctx.extra ?? {}),
      },
      severity: ctx.severity,
    });
  }
}

/**
 * ids of invoice lines that already have a return recorded against them.
 *
 * `processReturn` only blocks re-returning the *same* line, so a `completed`
 * invoice can carry a partial return. Restoring those lines again on void would
 * credit accessory stock twice, and would flip a roll returned as `damaged`
 * back to `in_stock`.
 */
export async function getReturnedLineIds(
  trx: Knex.Transaction,
  lineIds: number[],
): Promise<Set<number>> {
  if (lineIds.length === 0) return new Set();
  const rows = await trx('return_lines')
    .whereIn('original_invoice_line_id', lineIds)
    .select('original_invoice_line_id');
  return new Set(rows.map((r) => Number(r.original_invoice_line_id)));
}
