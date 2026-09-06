/**
 * Partial roll/fabric return maths — mirrors
 * backend/src/domain/sales/returnQuantity.ts so the return dialog can show a
 * live, correct refund preview before submitting.
 */

export function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** What's left that can still be returned on a line, given what already has been. */
export function remainingReturnableQuantity(soldQuantity: number, alreadyReturned: number): number {
  const remaining = soldQuantity - alreadyReturned;
  return remaining > 0 ? roundQty(remaining) : 0;
}

/** Refund proportional to the fraction of the original line being returned now. */
export function proportionalRefund(lineTotalEgp: number, soldQuantity: number, requestedQuantity: number): number {
  if (soldQuantity <= 0) return 0;
  return round2((lineTotalEgp * requestedQuantity) / soldQuantity);
}

/** How much refund remains available for a line, given what's already been refunded. */
export function remainingRefundable(lineTotalEgp: number, alreadyRefundedEgp: number): number {
  const remaining = round2(lineTotalEgp - alreadyRefundedEgp);
  return remaining > 0 ? remaining : 0;
}
