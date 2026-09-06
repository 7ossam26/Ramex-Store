/**
 * Final-payment discount derivation — the cashier enters the amount the
 * customer actually paid, and the discount is derived automatically as the
 * difference between the invoice balance and that tendered amount, instead
 * of being typed in separately.
 *
 * Mirrors the backend's own validation in
 * backend/src/domain/sales/openInvoices.service.ts#addFinalPayment:
 *   required = round2(balance - discount)
 *   discount >= 0, discount <= balance
 */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type DeriveFinalPaymentResult = {
  /** The waived difference between balance and tendered — always >= 0. */
  discount: number;
  /** What must still be handed over in payment rows once the discount applies (== tendered when valid). */
  required: number;
  /** Set when `tendered` is not a valid amount for this balance. */
  error: 'NEGATIVE_AMOUNT' | 'OVERPAYMENT' | null;
};

export function deriveFinalPayment(params: { balance: number; tendered: number }): DeriveFinalPaymentResult {
  const { balance, tendered } = params;

  if (tendered < 0) {
    return { discount: 0, required: round2(balance), error: 'NEGATIVE_AMOUNT' };
  }
  if (tendered > balance + 0.001) {
    return { discount: 0, required: round2(balance), error: 'OVERPAYMENT' };
  }

  const discount = round2(Math.max(0, balance - tendered));
  const required = round2(balance - discount);
  return { discount, required, error: null };
}
