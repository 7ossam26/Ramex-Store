import type { Knex } from 'knex';
import { roundEgp } from './discountCalculator.js';
import { resolveInvoiceRollQuantity, type RollSaleUnit } from './lineQuantity.js';
import { remainingReturnableQuantity } from './returnQuantity.js';

export type RollLineReturnState = {
  soldQuantity: number;
  soldUnit: RollSaleUnit;
  /** Sum of returned_quantity across every prior return on this line (Infinity if a legacy whole-line return already covers it). */
  alreadyReturnedQuantity: number;
  alreadyReturnedRefundEgp: number;
  /** What's left that can still be returned right now. */
  remaining: number;
  /** True if any prior return against this line was disposed as `damaged` (written off, not restockable). */
  hasDamagedDisposition: boolean;
};

type RawInvoiceLine = {
  id: number | string;
  item_type: string | null;
  roll_id: number | string | null;
  sold_quantity: string | number | null;
  sold_unit: string | null;
};

/**
 * Loads the return state (sold quantity vs. already-returned quantity) for
 * every ROLL invoice line in `invoiceLines`. Accessory lines are excluded —
 * they stay whole-line, governed by the pre-existing "any return_lines row
 * exists" check.
 */
export async function loadRollLineReturnStates(
  trx: Knex,
  invoiceLines: RawInvoiceLine[],
): Promise<Map<number, RollLineReturnState>> {
  const rollLines = invoiceLines.filter((l) => l.item_type !== 'accessory' && l.roll_id != null);
  const result = new Map<number, RollLineReturnState>();
  if (rollLines.length === 0) return result;

  const rollIds = [...new Set(rollLines.map((l) => Number(l.roll_id)))];
  const rolls = await trx('rolls as r')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .whereIn('r.id', rollIds)
    .select('r.id', 'r.weight_kg', 'r.length_m', 'f.unit as fabric_unit');
  const rollMap = new Map(rolls.map((r) => [Number(r.id), r]));

  const lineIds = rollLines.map((l) => Number(l.id));
  const existingReturns = await trx('return_lines')
    .whereIn('original_invoice_line_id', lineIds)
    .select('original_invoice_line_id', 'returned_quantity', 'refund_amount_egp', 'roll_disposition');

  const returnedQtyByLine = new Map<number, number>();
  const returnedRefundByLine = new Map<number, number>();
  const damagedByLine = new Set<number>();
  for (const rl of existingReturns) {
    const lineId = Number(rl.original_invoice_line_id);
    returnedRefundByLine.set(
      lineId,
      roundEgp((returnedRefundByLine.get(lineId) ?? 0) + roundEgp(Number(rl.refund_amount_egp))),
    );
    // A NULL returned_quantity is a pre-partial-return-feature row, which
    // always covered the entire line.
    const qty = rl.returned_quantity != null ? Number(rl.returned_quantity) : Number.POSITIVE_INFINITY;
    returnedQtyByLine.set(lineId, (returnedQtyByLine.get(lineId) ?? 0) + qty);
    if (rl.roll_disposition === 'damaged') damagedByLine.add(lineId);
  }

  for (const line of rollLines) {
    const lineId = Number(line.id);
    const roll = rollMap.get(Number(line.roll_id));
    if (!roll) continue; // caller separately validates ROLL_NOT_FOUND

    let soldQuantity: number;
    let soldUnit: RollSaleUnit;
    if (line.sold_quantity != null && line.sold_unit != null) {
      soldQuantity = Number(line.sold_quantity);
      soldUnit = line.sold_unit as RollSaleUnit;
    } else {
      const resolved = resolveInvoiceRollQuantity({
        sold_quantity: null,
        sold_unit: null,
        fabric_unit: roll.fabric_unit as RollSaleUnit,
        length_m: roll.length_m,
        weight_kg: roll.weight_kg,
      });
      soldQuantity = resolved.quantity;
      soldUnit = resolved.unit;
    }

    const alreadyReturnedQuantity = returnedQtyByLine.get(lineId) ?? 0;
    const alreadyReturnedRefundEgp = returnedRefundByLine.get(lineId) ?? 0;
    const remaining = remainingReturnableQuantity(soldQuantity, alreadyReturnedQuantity);

    result.set(lineId, {
      soldQuantity,
      soldUnit,
      alreadyReturnedQuantity,
      alreadyReturnedRefundEgp,
      remaining,
      hasDamagedDisposition: damagedByLine.has(lineId),
    });
  }

  return result;
}
