import type { Knex } from 'knex';
import { roundEgp } from './discountCalculator.js';
import { resolveInvoiceRollQuantity } from './lineQuantity.js';
import type { InvoiceStatus } from './sales.types.js';

/**
 * Recompute and persist an invoice's return state after any return/exchange
 * line is written against it, inside the SAME transaction as that write.
 *
 * Root-cause fix: `processReturn` / `processExchange` / the scan-return flows
 * used to insert `return_lines` + refund `payments` + a customer-ledger entry
 * and stop there — the `invoices` header (status, and previously nothing at
 * all recording the refund) was never touched, so a fully-refunded invoice
 * kept showing `completed` / fully-paid everywhere in the UI and accounting.
 *
 * `total_egp`, `paid_egp` and `balance_egp` are deliberately left untouched —
 * they remain the historical record of the original sale (mirrors how
 * `voidInvoice` leaves them for a voided invoice). The refunded amount is
 * tracked separately in `returned_amount_egp`; net position is
 * `total_egp - returned_amount_egp`.
 */
export async function applyInvoiceReturnState(
  trx: Knex.Transaction,
  invoiceId: number,
  actorUserId: number,
): Promise<{ status: InvoiceStatus; returned_amount_egp: number }> {
  const invoice = await trx('invoices').where({ id: invoiceId }).first();
  if (!invoice) throw new Error('INVOICE_NOT_FOUND');

  // Only a completed-family invoice can carry return state — an `open`
  // deposit invoice can't be "returned" via this path (it uses
  // cancelOpenInvoice instead), and an already-cancelled/voided invoice must
  // not be resurrected into a return status.
  if (invoice.status !== 'completed' && invoice.status !== 'partially_returned') {
    return { status: invoice.status as InvoiceStatus, returned_amount_egp: Number(invoice.returned_amount_egp) };
  }

  const lines = await trx('invoice_lines')
    .where({ invoice_id: invoiceId })
    .select(
      'id',
      'item_type',
      'roll_id',
      'accessory_id',
      'qty_pieces',
      'sold_quantity',
      'sold_unit',
      'line_total_egp',
    );

  // Legacy rolls (pre-096) have no sold_quantity/sold_unit snapshot — resolve
  // from the roll itself, exactly like resolveInvoiceRollQuantity's other
  // callers (getInvoiceDetail, getReturnDetail).
  const legacyRollIds = lines
    .filter((l) => l.item_type !== 'accessory' && l.sold_quantity == null)
    .map((l) => Number(l.roll_id))
    .filter((id) => Number.isFinite(id));
  const legacyRolls =
    legacyRollIds.length > 0
      ? await trx('rolls as r')
          .join('fabrics as f', 'r.fabric_id', 'f.id')
          .whereIn('r.id', legacyRollIds)
          .select('r.id', 'r.weight_kg', 'r.length_m', 'f.unit as fabric_unit')
      : [];
  const legacyRollMap = new Map(legacyRolls.map((r) => [Number(r.id), r]));

  const returnedByLine = await trx('return_lines')
    .whereIn(
      'original_invoice_line_id',
      lines.map((l) => Number(l.id)),
    )
    .select('original_invoice_line_id', 'item_type', 'qty_pieces', 'returned_quantity', 'refund_amount_egp');

  const returnedQtyByLine = new Map<number, number>();
  const returnedRefundByLine = new Map<number, number>();
  for (const rl of returnedByLine) {
    const lineId = Number(rl.original_invoice_line_id);
    const refund = roundEgp(Number(rl.refund_amount_egp));
    returnedRefundByLine.set(lineId, roundEgp((returnedRefundByLine.get(lineId) ?? 0) + refund));

    let qty: number;
    if (rl.item_type === 'accessory') {
      qty = Number(rl.qty_pieces ?? 0);
    } else if (rl.returned_quantity != null) {
      qty = Number(rl.returned_quantity);
    } else {
      // Legacy return_lines row predating partial-quantity support: it always
      // covered the whole line.
      qty = Number.POSITIVE_INFINITY;
    }
    returnedQtyByLine.set(lineId, (returnedQtyByLine.get(lineId) ?? 0) + qty);
  }

  let totalRefund = 0;
  let anyReturned = false;
  let allFullyReturned = lines.length > 0;

  for (const line of lines) {
    const lineId = Number(line.id);
    const refund = returnedRefundByLine.get(lineId) ?? 0;
    totalRefund = roundEgp(totalRefund + refund);
    if (refund > 0) anyReturned = true;

    let soldQty: number;
    if (line.item_type === 'accessory') {
      soldQty = Number(line.qty_pieces ?? 0);
    } else if (line.sold_quantity != null && line.sold_unit != null) {
      soldQty = Number(line.sold_quantity);
    } else {
      const legacy = legacyRollMap.get(Number(line.roll_id));
      soldQty = legacy
        ? resolveInvoiceRollQuantity({
            sold_quantity: null,
            sold_unit: null,
            fabric_unit: legacy.fabric_unit,
            length_m: legacy.length_m,
            weight_kg: legacy.weight_kg,
          }).quantity
        : 0;
    }

    const returnedQty = returnedQtyByLine.get(lineId) ?? 0;
    const fullyReturned = returnedQty >= soldQty - 0.0005;
    if (!fullyReturned) allFullyReturned = false;
  }

  const newStatus: InvoiceStatus = allFullyReturned
    ? 'returned'
    : anyReturned
      ? 'partially_returned'
      : (invoice.status as InvoiceStatus);

  if (newStatus === invoice.status && roundEgp(Number(invoice.returned_amount_egp)) === totalRefund) {
    return { status: newStatus, returned_amount_egp: totalRefund };
  }

  await trx('invoices').where({ id: invoiceId }).update({
    status: newStatus,
    returned_amount_egp: totalRefund,
    returned_at: anyReturned ? trx.fn.now() : invoice.returned_at,
  });

  if (newStatus !== invoice.status) {
    await trx('invoice_status_history').insert({
      invoice_id: invoiceId,
      from_status: invoice.status,
      to_status: newStatus,
      actor_user_id: actorUserId,
      notes_ar:
        newStatus === 'returned'
          ? 'إرجاع كامل لجميع بنود الفاتورة'
          : 'إرجاع جزئي لبعض بنود الفاتورة',
    });
  }

  return { status: newStatus, returned_amount_egp: totalRefund };
}
