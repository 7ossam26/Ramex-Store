/**
 * 2-decimal EGP rounding helper. POS math is centralised here so subtle
 * floating-point drift cannot leak into invoice totals.
 */
export function roundEgp(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Back-calculates the cart-level discount from a target final price.
 * Used when the cashier types "I want to charge X EGP for this whole cart"
 * — the system stamps the discount required to land on X.
 *
 * Returns 0/0 if subtotal is zero to keep the math safe.
 * Negative discounts (markups) are rejected — POS should not silently
 * raise the price; an explicit price override per-line is the path.
 */
export function backCalculateDiscount(
  subtotal: number,
  targetFinal: number,
): { cart_discount_egp: number; effective_percent: number } {
  if (subtotal <= 0) return { cart_discount_egp: 0, effective_percent: 0 };
  const rawDiscount = subtotal - targetFinal;
  if (rawDiscount < 0) {
    throw new Error('TARGET_FINAL_GREATER_THAN_SUBTOTAL');
  }
  const cart_discount_egp = roundEgp(rawDiscount);
  const effective_percent = roundEgp((rawDiscount / subtotal) * 100);
  return { cart_discount_egp, effective_percent };
}

/**
 * Per-line percentage discount. Returns the discount amount (positive)
 * to subtract from the line subtotal.
 */
export function applyLineDiscount(lineSubtotal: number, percent: number): number {
  if (percent <= 0) return 0;
  if (percent >= 100) return roundEgp(lineSubtotal);
  return roundEgp(lineSubtotal * (percent / 100));
}
