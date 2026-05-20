import type { Knex } from 'knex';
import { recordMovement as cashRecordMovement } from './cashDrawerService.js';
import { recordMovement as bankRecordMovement } from './bankService.js';

/**
 * Called inside an existing transaction immediately after a payments row is inserted.
 * Routes the payment to the correct ledger (cash drawer or bank account).
 * amount is always the absolute value (positive).
 *
 * Routing rules:
 *   cash         → cash drawer
 *   instapay     → bank account (bankAccountId required)
 *   bank_transfer → bank account (bankAccountId required) — same routing as instapay
 *   cheque       → no ledger movement (payment-info only; clears outside v2 scope)
 */
export async function settlePayment(
  trx: Knex.Transaction,
  params: {
    method: 'cash' | 'instapay' | 'bank_transfer' | 'cheque';
    paymentKind: 'deposit' | 'final' | 'refund';
    amount: number;
    bankAccountId?: number | null;
    referenceType: string;
    referenceId: number;
    actorUserId: number;
    notesAr?: string | null;
  },
): Promise<void> {
  const {
    method,
    paymentKind,
    amount,
    bankAccountId,
    referenceType,
    referenceId,
    actorUserId,
    notesAr,
  } = params;

  if (method === 'cash') {
    if (paymentKind === 'deposit') {
      await cashRecordMovement(
        trx, 'in', 'deposit_payment', amount, actorUserId,
        referenceType, referenceId, notesAr,
      );
    } else if (paymentKind === 'final') {
      await cashRecordMovement(
        trx, 'in', 'sale_payment', amount, actorUserId,
        referenceType, referenceId, notesAr,
      );
    } else {
      await cashRecordMovement(
        trx, 'out', 'refund', amount, actorUserId,
        referenceType, referenceId, notesAr,
      );
    }
  } else if (method === 'instapay' || method === 'bank_transfer') {
    // Both instapay and bank_transfer route funds to a bank account vault.
    if (bankAccountId == null) {
      throw new Error(
        method === 'instapay'
          ? 'INSTAPAY_REQUIRES_BANK_ACCOUNT'
          : 'BANK_TRANSFER_REQUIRES_BANK_ACCOUNT',
      );
    }
    const movementType = method === 'instapay' ? 'instapay_payment' : 'bank_transfer_payment';
    if (paymentKind === 'deposit' || paymentKind === 'final') {
      await bankRecordMovement(
        trx, bankAccountId, 'in', movementType, amount, actorUserId,
        referenceType, referenceId, notesAr,
      );
    } else {
      await bankRecordMovement(
        trx, bankAccountId, 'out', 'refund', amount, actorUserId,
        referenceType, referenceId, notesAr,
      );
    }
  } else if (method === 'cheque') {
    // Cheque is payment-info only in v2. No ledger movement until the cheque
    // is cleared/bounced (status management is out of scope for v2).
    // The invoice balance is still updated by the caller; only the cash/bank
    // vault remains unchanged until clearing.
  } else {
    throw new Error(`UNKNOWN_PAYMENT_METHOD:${method}`);
  }
}
