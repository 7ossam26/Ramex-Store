import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import { auditFromService } from '../inventory/audit.helper.js';
import { notify } from '../notifications/notificationsService.js';
import { roundEgp } from './discountCalculator.js';
import { settlePayment } from '../finance/paymentSettlementService.js';
import type { Invoice, InvoiceStatus, PaymentMethod } from './sales.types.js';

const EPS = 0.001;

type FinalPayment = {
  method: PaymentMethod;
  amount: number;
  bankAccountId?: number | null;
};

type StatusHistoryRow = {
  id: number;
  invoice_id: number;
  from_status: string | null;
  to_status: string;
  actor_user_id: number;
  actor_username: string | null;
  notes_ar: string | null;
  created_at: string;
};

async function appendStatusHistory(
  trx: Knex.Transaction,
  invoiceId: number,
  from: string | null,
  to: string,
  actorUserId: number,
  notesAr: string | null = null,
): Promise<void> {
  await trx('invoice_status_history').insert({
    invoice_id: invoiceId,
    from_status: from,
    to_status: to,
    actor_user_id: actorUserId,
    notes_ar: notesAr,
  });
}

async function lockInvoiceWithLineRolls(
  trx: Knex.Transaction,
  invoiceId: number,
): Promise<{ invoice: Invoice & { delivered_at: string | null }; rollIds: number[] }> {
  const invoice = await trx('invoices').where({ id: invoiceId }).forUpdate().first();
  if (!invoice) throw new Error('INVOICE_NOT_FOUND');
  const lines = await trx('invoice_lines').where({ invoice_id: invoiceId }).select('roll_id');
  const rollIds = lines.map((l: { roll_id: number }) => l.roll_id);
  if (rollIds.length > 0) {
    // Row-lock each roll referenced by this invoice.
    await trx('rolls').whereIn('id', rollIds).forUpdate().select('id');
  }
  return { invoice: invoice as Invoice & { delivered_at: string | null }, rollIds };
}

/**
 * Add final payment(s) to an open invoice. Payments must equal or exceed the
 * remaining balance. Once balance hits zero, status flips to
 * `closed_pending_pickup` and reserved rolls become `sold`.
 */
export async function addFinalPayment(
  invoiceId: number,
  actorUserId: number,
  payments: FinalPayment[],
): Promise<{ invoice: Invoice }> {
  if (payments.length === 0) throw new Error('NO_PAYMENT_PROVIDED');

  return db.transaction(async (trx) => {
    const { invoice, rollIds } = await lockInvoiceWithLineRolls(trx, invoiceId);
    if (invoice.status !== 'open') throw new Error('INVOICE_NOT_OPEN');

    const balance = roundEgp(Number(invoice.balance_egp));
    const paidNow = roundEgp(payments.reduce((s, p) => s + Number(p.amount), 0));
    if (paidNow <= 0) throw new Error('NO_PAYMENT_PROVIDED');
    if (paidNow + EPS < balance) throw new Error('FINAL_PAYMENT_BELOW_BALANCE');
    if (paidNow > balance + EPS) throw new Error('OVERPAYMENT_NOT_ALLOWED');

    let defaultBankId: number | null = null;
    const needsBank = payments.some((p) => p.method === 'instapay' && p.bankAccountId == null);
    if (needsBank) {
      const def = await trx('bank_accounts').where({ is_default: true, is_active: true }).first();
      if (!def) throw new Error('NO_DEFAULT_BANK_ACCOUNT');
      defaultBankId = def.id as number;
    }

    // Insert payments + customer ledger.
    const customer = await trx('customers')
      .where({ id: invoice.customer_id })
      .forUpdate()
      .first();
    if (!customer) throw new Error('CUSTOMER_NOT_FOUND');

    let customerBalance = Number(customer.current_balance_egp);
    for (const p of payments) {
      const amount = roundEgp(Number(p.amount));
      const bankId = p.method === 'instapay' ? (p.bankAccountId ?? defaultBankId) : null;
      await trx('payments').insert({
        invoice_id: invoiceId,
        method: p.method,
        amount_egp: amount,
        payment_kind: 'final',
        bank_account_id: bankId,
        actor_user_id: actorUserId,
      });
      await settlePayment(trx, {
        method: p.method,
        paymentKind: 'final',
        amount,
        bankAccountId: bankId,
        referenceType: 'invoice',
        referenceId: invoiceId,
        actorUserId,
      });
      const newBalance = roundEgp(customerBalance + amount);
      customerBalance = newBalance;
      await trx('customer_ledger_entries').insert({
        customer_id: invoice.customer_id,
        entry_type: 'payment',
        reference_type: 'invoice',
        reference_id: invoiceId,
        amount_egp: amount,
        balance_after_egp: newBalance,
        actor_user_id: actorUserId,
      });
    }
    await trx('customers')
      .where({ id: invoice.customer_id })
      .update({ current_balance_egp: customerBalance, updated_at: trx.fn.now() });

    const newPaid = roundEgp(Number(invoice.paid_egp) + paidNow);
    const newBalance = roundEgp(Number(invoice.total_egp) - newPaid);
    const closed = newBalance <= EPS;

    if (closed) {
      // Flip rolls from reserved → sold and emit sale_out movements.
      for (const rollId of rollIds) {
        await trx('rolls').where({ id: rollId }).update({
          status: 'sold',
          updated_at: trx.fn.now(),
        });
        await trx('stock_movements').insert({
          roll_id: rollId,
          from_warehouse: null,
          to_warehouse: null,
          event_type: 'sale_out',
          reference_type: 'invoice',
          reference_id: invoiceId,
          actor_user_id: actorUserId,
        });
      }
    }

    const newStatus: InvoiceStatus = closed ? 'closed_pending_pickup' : 'open';

    const [updated] = await trx('invoices')
      .where({ id: invoiceId })
      .update({
        paid_egp: newPaid,
        balance_egp: newBalance,
        status: newStatus,
        closed_at: closed ? trx.fn.now() : invoice.closed_at,
      })
      .returning('*');

    if (closed) {
      await appendStatusHistory(trx, invoiceId, 'open', 'closed_pending_pickup', actorUserId);
    }

    await auditFromService(trx, {
      actorUserId,
      action: 'invoice_final_payment',
      entity: 'invoice',
      entityId: invoiceId,
      before: { paid_egp: Number(invoice.paid_egp), status: invoice.status },
      after: { paid_egp: newPaid, status: newStatus, payments_added: payments.length },
      severity: 'medium',
    });

    return { invoice: updated as Invoice };
  });
}

/**
 * Mark a `closed_pending_pickup` invoice as delivered. Sets delivered_at +
 * delivered_by_user_id, flips status to `completed`, and writes status history.
 */
export async function markDelivered(
  invoiceId: number,
  actorUserId: number,
): Promise<{ invoice: Invoice }> {
  return db.transaction(async (trx) => {
    const { invoice } = await lockInvoiceWithLineRolls(trx, invoiceId);
    if (invoice.status !== 'closed_pending_pickup') {
      throw new Error('INVOICE_NOT_PENDING_PICKUP');
    }

    const [updated] = await trx('invoices')
      .where({ id: invoiceId })
      .update({
        status: 'completed',
        delivered_at: trx.fn.now(),
        delivered_by_user_id: actorUserId,
        pickup_at: trx.fn.now(),
      })
      .returning('*');

    await appendStatusHistory(
      trx,
      invoiceId,
      'closed_pending_pickup',
      'completed',
      actorUserId,
    );

    await auditFromService(trx, {
      actorUserId,
      action: 'invoice_marked_delivered',
      entity: 'invoice',
      entityId: invoiceId,
      before: { status: 'closed_pending_pickup' },
      after: { status: 'completed' },
      severity: 'medium',
    });

    return { invoice: updated as Invoice };
  });
}

export type DepositHandling = 'full_refund' | 'partial_refund' | 'keep_as_credit';

/**
 * Cancel an open invoice (status `open` or `closed_pending_pickup`).
 *
 * Per CORE_PLAN §6 Module 8, "Cancellation with deposit: Ziad picks
 * full refund / partial refund / kept as credit" — no Owner approval
 * required for open-invoice cancellation. Voiding `completed` invoices
 * uses the separate `voidInvoice` flow which DOES require Owner approval.
 *
 * - `full_refund`: full deposit returned; rolls → in_stock.
 * - `partial_refund`: refund a smaller amount; remainder is shop retention
 *    (no further ledger reduction beyond the refund entry).
 * - `keep_as_credit`: deposit becomes positive customer credit (adjustment
 *    ledger entry, no money movement).
 */
export async function cancelOpenInvoice(
  invoiceId: number,
  actorUserId: number,
  opts: {
    depositHandling: DepositHandling;
    refundMethod?: PaymentMethod | null;
    partialRefundAmount?: number | null;
    notesAr: string;
  },
): Promise<{ invoice: Invoice }> {
  return db.transaction(async (trx) => {
    const { invoice, rollIds } = await lockInvoiceWithLineRolls(trx, invoiceId);
    if (invoice.status !== 'open' && invoice.status !== 'closed_pending_pickup') {
      throw new Error('INVOICE_NOT_CANCELLABLE');
    }

    const paid = roundEgp(Number(invoice.paid_egp));
    let refundAmount = 0;
    if (opts.depositHandling === 'full_refund') {
      refundAmount = paid;
    } else if (opts.depositHandling === 'partial_refund') {
      const amt = roundEgp(Number(opts.partialRefundAmount ?? 0));
      if (amt <= 0) throw new Error('PARTIAL_REFUND_INVALID');
      if (amt > paid + EPS) throw new Error('PARTIAL_REFUND_EXCEEDS_PAID');
      refundAmount = amt;
    }

    if (refundAmount > 0 && !opts.refundMethod) {
      throw new Error('REFUND_METHOD_REQUIRED');
    }

    // Resolve bank for instapay refund.
    let refundBankId: number | null = null;
    if (refundAmount > 0 && opts.refundMethod === 'instapay') {
      const def = await trx('bank_accounts')
        .where({ is_default: true, is_active: true })
        .first();
      if (!def) throw new Error('NO_DEFAULT_BANK_ACCOUNT');
      refundBankId = def.id as number;
    }

    // Flip rolls back to in_stock + emit unreserve movements.
    for (const rollId of rollIds) {
      await trx('rolls').where({ id: rollId }).update({
        status: 'in_stock',
        updated_at: trx.fn.now(),
      });
      await trx('stock_movements').insert({
        roll_id: rollId,
        from_warehouse: null,
        to_warehouse: null,
        event_type: 'unreserve',
        reference_type: 'invoice',
        reference_id: invoiceId,
        actor_user_id: actorUserId,
        notes_ar: `إلغاء فاتورة مفتوحة: ${opts.notesAr}`,
      });
    }

    const customer = await trx('customers')
      .where({ id: invoice.customer_id })
      .forUpdate()
      .first();
    if (!customer) throw new Error('CUSTOMER_NOT_FOUND');

    let customerBalance = Number(customer.current_balance_egp);
    let lifetime = Number(customer.lifetime_volume_egp);

    // Reverse the lifetime_volume bump that was applied when the open
    // invoice was created (Phase 4 logic increments at first sale event).
    lifetime = roundEgp(lifetime - Number(invoice.total_egp));

    // Cash refund row (separate from customer book balance).
    if (refundAmount > 0) {
      await trx('payments').insert({
        invoice_id: invoiceId,
        method: opts.refundMethod!,
        amount_egp: -refundAmount,
        payment_kind: 'refund',
        bank_account_id: refundBankId,
        notes_ar: `إلغاء فاتورة: ${opts.notesAr}`,
        actor_user_id: actorUserId,
      });
      await settlePayment(trx, {
        method: opts.refundMethod!,
        paymentKind: 'refund',
        amount: refundAmount,
        bankAccountId: refundBankId,
        referenceType: 'invoice',
        referenceId: invoiceId,
        actorUserId,
        notesAr: `إلغاء فاتورة: ${opts.notesAr}`,
      });
    }

    // Reverse the sale's effect on customer book balance.
    //
    // Phase 4 createSale applied: balance += paid (per payment), balance -= total
    //   (sale entry). Net pre-existing change = paid - total = -(total - paid).
    //
    // - keep_as_credit: customer keeps `paid` as credit. Target net change = +paid.
    //   Adjustment delta = +total (one entry reversing only the -total sale).
    // - full_refund / partial_refund: customer is whole (got cash back, or shop
    //   retained shop-revenue portion). Target net change = 0.
    //   Reversal delta = +(total - paid) (mirrors voidInvoice for completed).
    if (opts.depositHandling === 'keep_as_credit') {
      const delta = roundEgp(Number(invoice.total_egp));
      const newBalance = roundEgp(customerBalance + delta);
      customerBalance = newBalance;
      await trx('customer_ledger_entries').insert({
        customer_id: invoice.customer_id,
        entry_type: 'adjustment',
        reference_type: 'invoice',
        reference_id: invoiceId,
        amount_egp: delta,
        balance_after_egp: newBalance,
        notes_ar: `العربون محتفظ به كرصيد دائن: ${opts.notesAr}`,
        actor_user_id: actorUserId,
      });
    } else {
      const delta = roundEgp(Number(invoice.total_egp) - paid);
      if (Math.abs(delta) > EPS) {
        const newBalance = roundEgp(customerBalance + delta);
        customerBalance = newBalance;
        await trx('customer_ledger_entries').insert({
          customer_id: invoice.customer_id,
          entry_type: 'refund',
          reference_type: 'invoice',
          reference_id: invoiceId,
          amount_egp: delta,
          balance_after_egp: newBalance,
          notes_ar: `إلغاء فاتورة ${invoice.invoice_no}: ${opts.notesAr}`,
          actor_user_id: actorUserId,
        });
      }
    }

    await trx('customers')
      .where({ id: invoice.customer_id })
      .update({
        current_balance_egp: customerBalance,
        lifetime_volume_egp: lifetime,
        updated_at: trx.fn.now(),
      });

    const [updated] = await trx('invoices')
      .where({ id: invoiceId })
      .update({
        status: 'cancelled',
        cancelled_at: trx.fn.now(),
        cancelled_reason_ar: opts.notesAr,
      })
      .returning('*');

    await appendStatusHistory(trx, invoiceId, invoice.status, 'cancelled', actorUserId, opts.notesAr);

    await auditFromService(trx, {
      actorUserId,
      action: 'open_invoice_cancelled',
      entity: 'invoice',
      entityId: invoiceId,
      before: { status: invoice.status, paid_egp: paid },
      after: {
        status: 'cancelled',
        deposit_handling: opts.depositHandling,
        refund_amount: refundAmount,
        refund_method: opts.refundMethod ?? null,
        notes_ar: opts.notesAr,
      },
      severity: 'medium',
    });

    await notify({
      recipientRole: 'owner',
      severity: 'medium',
      eventType: 'void_requested',
      titleAr: 'فاتورة مفتوحة ملغاة',
      bodyAr: `تم إلغاء الفاتورة المفتوحة رقم ${invoice.invoice_no}`,
      payload: {
        invoice_id: invoiceId,
        invoice_no: invoice.invoice_no,
        deposit_handling: opts.depositHandling,
        refund_amount: refundAmount,
      },
    });

    return { invoice: updated as Invoice };
  });
}

export async function getStatusHistory(invoiceId: number): Promise<StatusHistoryRow[]> {
  return (await db('invoice_status_history as h')
    .where('h.invoice_id', invoiceId)
    .leftJoin('users as u', 'h.actor_user_id', 'u.id')
    .select(
      'h.id',
      'h.invoice_id',
      'h.from_status',
      'h.to_status',
      'h.actor_user_id',
      'u.username as actor_username',
      'h.notes_ar',
      'h.created_at',
    )
    .orderBy('h.created_at', 'asc')) as StatusHistoryRow[];
}

export async function listOpenInvoices(): Promise<
  Array<Invoice & { customer_name_ar: string; age_days: number }>
> {
  const rows = await db('invoices as i')
    .leftJoin('customers as c', 'i.customer_id', 'c.id')
    .where('i.status', 'open')
    .select('i.*', 'c.name_ar as customer_name_ar')
    .orderBy('i.created_at', 'asc');
  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    age_days: Math.floor((now - new Date(r.created_at).getTime()) / 86_400_000),
  })) as Array<Invoice & { customer_name_ar: string; age_days: number }>;
}

export async function listPendingPickup(): Promise<
  Array<Invoice & { customer_name_ar: string; customer_phone: string }>
> {
  const rows = await db('invoices as i')
    .leftJoin('customers as c', 'i.customer_id', 'c.id')
    .where('i.status', 'closed_pending_pickup')
    .select('i.*', 'c.name_ar as customer_name_ar', 'c.phone as customer_phone')
    .orderBy('i.closed_at', 'asc');
  return rows as Array<Invoice & { customer_name_ar: string; customer_phone: string }>;
}
