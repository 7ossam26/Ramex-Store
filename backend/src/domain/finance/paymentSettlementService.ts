import type { Knex } from 'knex';
import { recordMovement as cashRecordMovement } from './cashDrawerService.js';
import { recordMovement as bankRecordMovement } from './bankService.js';

/**
 * Called inside an existing transaction immediately after a payments row is inserted.
 * Routes the payment to the correct ledger (cash drawer or bank account).
 * amount is always the absolute value (positive).
 */
export async function settlePayment(
  trx: Knex.Transaction,
  params: {
    method: 'cash' | 'instapay';
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
  } else if (method === 'instapay') {
    if (bankAccountId == null) throw new Error('INSTAPAY_REQUIRES_BANK_ACCOUNT');
    if (paymentKind === 'deposit' || paymentKind === 'final') {
      await bankRecordMovement(
        trx, bankAccountId, 'in', 'instapay_payment', amount, actorUserId,
        referenceType, referenceId, notesAr,
      );
    } else {
      await bankRecordMovement(
        trx, bankAccountId, 'out', 'refund', amount, actorUserId,
        referenceType, referenceId, notesAr,
      );
    }
  } else {
    throw new Error(`UNKNOWN_PAYMENT_METHOD:${method}`);
  }
}
