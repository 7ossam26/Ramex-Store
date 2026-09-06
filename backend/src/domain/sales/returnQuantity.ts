import { roundEgp } from './discountCalculator.js';

/** How much of a roll/fabric line is still returnable, given what's already gone back. */
export function remainingReturnableQuantity(soldQuantity: number, alreadyReturned: number): number {
  const remaining = soldQuantity - alreadyReturned;
  return remaining > 0 ? roundQty(remaining) : 0;
}

/** 3-decimal rounding for physical quantities (kg / meter), matching the DB column precision. */
export function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Throws when a requested return quantity is invalid against what remains
 * returnable. Reuses RETURN_LINE_ALREADY_RETURNED when nothing is left (so
 * the existing "already returned" UX/message is unchanged for the common
 * full-return case), and a new error when the request merely overshoots.
 */
export function assertReturnQuantity(requested: number, remaining: number): void {
  if (remaining <= 0) throw new Error('RETURN_LINE_ALREADY_RETURNED');
  if (requested <= 0) throw new Error('RETURN_QUANTITY_INVALID');
  if (requested > remaining + 0.0005) throw new Error('RETURN_QUANTITY_EXCEEDS_REMAINING');
}

/** Refund proportional to the fraction of the original line being returned now. */
export function proportionalRefund(lineTotalEgp: number, soldQuantity: number, requestedQuantity: number): number {
  if (soldQuantity <= 0) return 0;
  return roundEgp((lineTotalEgp * requestedQuantity) / soldQuantity);
}

/** How much refund remains available for a line, given what's already been refunded. */
export function remainingRefundable(lineTotalEgp: number, alreadyRefundedEgp: number): number {
  const remaining = roundEgp(lineTotalEgp - alreadyRefundedEgp);
  return remaining > 0 ? remaining : 0;
}
