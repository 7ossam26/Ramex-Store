import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import { auditFromService } from '../inventory/audit.helper.js';
import { notify } from '../notifications/notificationsService.js';
import { backCalculateDiscount, roundEgp } from './discountCalculator.js';
import { settlePayment } from '../finance/paymentSettlementService.js';
import { getSetting } from '../settings/settings.service.js';
import { resolveRollSaleQuantity } from './lineQuantity.js';
import {
  lockAccessories,
  restoreAccessoryStock,
  splitInvoiceLines,
  type InvoiceAccessoryLine,
} from './accessoryStock.js';
import type {
  AddLinesInput,
  ChequeDetails,
  DepositRefundInput,
  FulfillmentDestination,
  Invoice,
  InvoiceStatus,
  PaymentMethod,
} from './sales.types.js';

const EPS = 0.001;

type FinalPayment = {
  method: PaymentMethod;
  amount: number;
  bankAccountId?: number | null;
  reference?: string | null;
  chequeDetails?: ChequeDetails | null;
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

type LockedInvoice = {
  invoice: Invoice & { delivered_at: string | null };
  /** roll_id of every roll line. Never contains NULL — see the filter below. */
  rollIds: number[];
  /** One entry per accessory line, in line order. */
  accessoryLines: InvoiceAccessoryLine[];
};

/**
 * Locks the invoice header plus every stock row it touches, and splits the
 * lines by `item_type`.
 *
 * The split is the whole point: since migration 082 an accessory line carries
 * `roll_id = NULL`, and migration 093's `chk_stock_movements_entity_type`
 * rejects a stock_movements row with `entity_type='roll'` and a NULL `roll_id`.
 * Feeding a NULL into a roll loop is therefore a guaranteed 23514, which the
 * global error handler flattens into «القيمة المُدخلة غير مسموح بها».
 *
 * Lock order is fixed at rolls → accessories (both ascending by id) to match
 * createSale, so the two transactions cannot deadlock against each other.
 */
async function lockInvoiceWithLines(
  trx: Knex.Transaction,
  invoiceId: number,
): Promise<LockedInvoice> {
  const invoice = await trx('invoices').where({ id: invoiceId }).forUpdate().first();
  if (!invoice) throw new Error('INVOICE_NOT_FOUND');

  const lines = await trx('invoice_lines')
    .where({ invoice_id: invoiceId })
    .orderBy('id', 'asc')
    .select('id', 'item_type', 'roll_id', 'accessory_id', 'qty_pieces');

  const { rollIds, accessoryLines } = splitInvoiceLines(lines);

  if (rollIds.length > 0) {
    // Row-lock each roll referenced by this invoice.
    await trx('rolls').whereIn('id', rollIds).orderBy('id', 'asc').forUpdate().select('id');
  }
  await lockAccessories(trx, accessoryLines);

  return {
    invoice: invoice as Invoice & { delivered_at: string | null },
    rollIds,
    accessoryLines,
  };
}

/**
 * Add final payment(s) to an open invoice. Payments must cover the remaining
 * balance, less any `discountEgp` waived at settlement time. Once balance hits
 * zero, status flips to `closed_pending_pickup` and reserved rolls become
 * `sold`.
 */
export async function addFinalPayment(
  invoiceId: number,
  actorUserId: number,
  payments: FinalPayment[],
  shiftId: number | null = null,
  discountEgp = 0,
): Promise<{ invoice: Invoice }> {
  return db.transaction(async (trx) => {
    const { invoice, rollIds } = await lockInvoiceWithLines(trx, invoiceId);
    if (invoice.status !== 'open') throw new Error('INVOICE_NOT_OPEN');

    const balance = roundEgp(Number(invoice.balance_egp));
    const discount = roundEgp(Number(discountEgp) || 0);
    if (discount < 0) throw new Error('INVALID_DISCOUNT');
    if (discount > balance + EPS) throw new Error('DISCOUNT_EXCEEDS_BALANCE');
    // What the customer still has to hand over after the waived amount.
    const required = roundEgp(balance - discount);

    const paidNow = roundEgp(payments.reduce((s, p) => s + Number(p.amount), 0));
    if (paidNow <= 0 && discount <= 0) throw new Error('NO_PAYMENT_PROVIDED');
    if (paidNow + EPS < required) throw new Error('FINAL_PAYMENT_BELOW_BALANCE');
    if (paidNow > required + EPS) throw new Error('OVERPAYMENT_NOT_ALLOWED');

    let defaultBankId: number | null = null;
    const needsBank = payments.some(
      (p) =>
        (p.method === 'instapay' || p.method === 'bank_transfer') && p.bankAccountId == null,
    );
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
      const bankId =
        p.method === 'instapay' || p.method === 'bank_transfer'
          ? (p.bankAccountId ?? defaultBankId)
          : null;
      const [{ id: paymentId }] = await trx('payments').insert({
        invoice_id: invoiceId,
        method: p.method,
        amount_egp: amount,
        payment_kind: 'final',
        bank_account_id: bankId,
        reference: p.reference ?? null,
        actor_user_id: actorUserId,
      }).returning('id');
      if (p.method === 'cheque' && p.chequeDetails) {
        await trx('cheques').insert({
          payment_id: paymentId,
          cheque_number: p.chequeDetails.chequeNumber,
          bank_name_ar: p.chequeDetails.bankNameAr,
          branch_ar: p.chequeDetails.branchAr ?? null,
          issuer_name_ar: p.chequeDetails.issuerNameAr ?? null,
          amount_egp: amount,
          issue_date: p.chequeDetails.issueDate,
          due_date: p.chequeDetails.dueDate,
          notes_ar: p.chequeDetails.notesAr ?? null,
        });
      }
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
    // A waived amount lowers what the customer owes without any money moving,
    // so it lands on the ledger as an adjustment (sale posts -total, payments
    // post +amount, so a discount posts +discount).
    if (discount > 0) {
      customerBalance = roundEgp(customerBalance + discount);
      await trx('customer_ledger_entries').insert({
        customer_id: invoice.customer_id,
        entry_type: 'adjustment',
        reference_type: 'invoice',
        reference_id: invoiceId,
        amount_egp: discount,
        balance_after_egp: customerBalance,
        notes_ar: `خصم عند الدفعة النهائية لفاتورة ${invoice.invoice_no}`,
        actor_user_id: actorUserId,
      });
    }

    await trx('customers')
      .where({ id: invoice.customer_id })
      .update({ current_balance_egp: customerBalance, updated_at: trx.fn.now() });

    const newTotal = roundEgp(Number(invoice.total_egp) - discount);
    const newFinalDiscount = roundEgp(Number(invoice.final_discount_egp) + discount);
    const newPaid = roundEgp(Number(invoice.paid_egp) + paidNow);
    const newBalance = roundEgp(newTotal - newPaid);
    const closed = newBalance <= EPS;

    if (closed) {
      // Flip rolls from reserved → sold and emit sale_out movements.
      //
      // Accessories are deliberately untouched: their qty_in_stock was already
      // decremented at sale time, and closing the invoice is when the goods
      // actually leave — there is nothing to reverse.
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

    await trx('invoices').where({ id: invoiceId }).update({
      total_egp: newTotal,
      final_discount_egp: newFinalDiscount,
      paid_egp: newPaid,
      balance_egp: newBalance,
      status: newStatus,
      closed_at: closed ? trx.fn.now() : invoice.closed_at,
      ...(shiftId != null ? { shift_id: shiftId } : {}),
    });
    const updated = await trx('invoices').where({ id: invoiceId }).first();

    if (closed) {
      await appendStatusHistory(trx, invoiceId, 'open', 'closed_pending_pickup', actorUserId);
    }

    await auditFromService(trx, {
      actorUserId,
      action: 'invoice_final_payment',
      entity: 'invoice',
      entityId: invoiceId,
      before: {
        paid_egp: Number(invoice.paid_egp),
        total_egp: Number(invoice.total_egp),
        final_discount_egp: Number(invoice.final_discount_egp),
        status: invoice.status,
      },
      after: {
        paid_egp: newPaid,
        total_egp: newTotal,
        final_discount_egp: newFinalDiscount,
        discount_applied_egp: discount,
        status: newStatus,
        payments_added: payments.length,
      },
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
    const { invoice } = await lockInvoiceWithLines(trx, invoiceId);
    if (invoice.status !== 'closed_pending_pickup') {
      throw new Error('INVOICE_NOT_PENDING_PICKUP');
    }

    await trx('invoices').where({ id: invoiceId }).update({
      status: 'completed',
      delivered_at: trx.fn.now(),
      delivered_by_user_id: actorUserId,
      pickup_at: trx.fn.now(),
    });
    const updated = await trx('invoices').where({ id: invoiceId }).first();

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
    bankAccountId?: number | null;
    reference?: string | null;
    chequeDetails?: ChequeDetails | null;
    notesAr: string;
    shiftId?: number | null;
  },
): Promise<{ invoice: Invoice }> {
  return db.transaction(async (trx) => {
    const { invoice, rollIds, accessoryLines } = await lockInvoiceWithLines(trx, invoiceId);
    if (invoice.status !== 'open' && invoice.status !== 'closed_pending_pickup') {
      throw new Error('INVOICE_NOT_CANCELLABLE');
    }

    // Lock the customer BEFORE any stock row. createSale locks customers → rolls
    // → accessories; taking them in the opposite order here would open a
    // deadlock window between a concurrent sale and cancel for the same customer.
    const customer = await trx('customers')
      .where({ id: invoice.customer_id })
      .forUpdate()
      .first();
    if (!customer) throw new Error('CUSTOMER_NOT_FOUND');

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

    // Resolve bank for instapay/bank_transfer refunds.
    let refundBankId: number | null = null;
    if (
      refundAmount > 0 &&
      (opts.refundMethod === 'instapay' || opts.refundMethod === 'bank_transfer')
    ) {
      if (opts.bankAccountId != null) {
        const acc = await trx('bank_accounts')
          .where({ id: opts.bankAccountId, is_active: true })
          .first();
        if (!acc) throw new Error('NO_DEFAULT_BANK_ACCOUNT');
        refundBankId = acc.id as number;
      } else {
        const def = await trx('bank_accounts')
          .where({ is_default: true, is_active: true })
          .first();
        if (!def) throw new Error('NO_DEFAULT_BANK_ACCOUNT');
        refundBankId = def.id as number;
      }
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

    // Accessory pieces go back on the shelf. This sits outside the
    // depositHandling branching on purpose: full_refund / partial_refund /
    // keep_as_credit differ only in what happens to the customer's money, and
    // say nothing about where the goods are. In all three the sale is off and
    // the pieces never left the shop.
    await restoreAccessoryStock(trx, accessoryLines, actorUserId, {
      action: 'cancel_restore_accessory',
      invoiceId,
      severity: 'medium',
      extra: { deposit_handling: opts.depositHandling, notes_ar: opts.notesAr },
    });

    let customerBalance = Number(customer.current_balance_egp);
    let lifetime = Number(customer.lifetime_volume_egp);

    // Reverse the lifetime_volume bump that was applied when the open
    // invoice was created (Phase 4 logic increments at first sale event).
    lifetime = roundEgp(lifetime - Number(invoice.total_egp));

    // Cash refund row (separate from customer book balance).
    if (refundAmount > 0) {
      const [{ id: paymentId }] = await trx('payments').insert({
        invoice_id: invoiceId,
        method: opts.refundMethod!,
        amount_egp: -refundAmount,
        payment_kind: 'refund',
        bank_account_id: refundBankId,
        reference: opts.reference ?? null,
        notes_ar: `إلغاء فاتورة: ${opts.notesAr}`,
        actor_user_id: actorUserId,
      }).returning('id');
      if (opts.refundMethod === 'cheque' && opts.chequeDetails) {
        await trx('cheques').insert({
          payment_id: paymentId,
          cheque_number: opts.chequeDetails.chequeNumber,
          bank_name_ar: opts.chequeDetails.bankNameAr,
          branch_ar: opts.chequeDetails.branchAr ?? null,
          issuer_name_ar: opts.chequeDetails.issuerNameAr ?? null,
          amount_egp: refundAmount,
          issue_date: opts.chequeDetails.issueDate,
          due_date: opts.chequeDetails.dueDate,
          notes_ar: opts.chequeDetails.notesAr ?? null,
        });
      }
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

    await trx('invoices').where({ id: invoiceId }).update({
      status: 'cancelled',
      cancelled_at: trx.fn.now(),
      cancelled_reason_ar: opts.notesAr,
      ...(opts.shiftId != null ? { shift_id: opts.shiftId } : {}),
    });
    const updated = await trx('invoices').where({ id: invoiceId }).first();

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
  Array<
    Invoice & {
      customer_name_ar: string;
      age_days: number;
      is_stale: boolean;
      stale_threshold_days: number;
      line_count: number;
    }
  >
> {
  const staleDays = await getSetting<number>(undefined, 'stale_invoice_days', 7);
  const rows = await db('invoices as i')
    .leftJoin('customers as c', 'i.customer_id', 'c.id')
    .where('i.status', 'open')
    .select(
      'i.*',
      'c.name_ar as customer_name_ar',
      db.raw(
        '(SELECT COUNT(*) FROM invoice_lines il WHERE il.invoice_id = i.id) as line_count',
      ),
    )
    .orderBy('i.created_at', 'asc');
  const now = Date.now();
  return rows.map((r) => {
    const ageDays = Math.floor((now - new Date(r.created_at).getTime()) / 86_400_000);
    return {
      ...r,
      age_days: ageDays,
      is_stale: ageDays >= staleDays,
      stale_threshold_days: staleDays,
      line_count: Number(r.line_count),
    };
  }) as Array<
    Invoice & {
      customer_name_ar: string;
      age_days: number;
      is_stale: boolean;
      stale_threshold_days: number;
      line_count: number;
    }
  >;
}

type RollPricingInfo = {
  weight_kg: string | null;
  length_m: string | null;
  fabric_unit: 'kg' | 'meter';
  selling_price_egp: string | null;
  reference_price_per_unit: string | null;
  warehouse: string;
  status: string;
  is_visible_at_pos: boolean;
};

type SettingsForLines = { taxEnabled: boolean; taxRate: number };

async function readTaxSettings(trx: Knex.Transaction): Promise<SettingsForLines> {
  const [taxEnabled, taxRate] = await Promise.all([
    getSetting<boolean>(trx, 'tax_enabled', false),
    getSetting<number>(trx, 'tax_rate', 0.14),
  ]);
  return { taxEnabled, taxRate };
}

/**
 * v2 Phase 5 — add lines to an existing open invoice.
 *
 * Recomputes subtotal/tax/rounding/total from `sum(line_totals)`. The existing
 * `paid_egp` is preserved; `balance_egp = total_egp − paid_egp` (may be
 * negative when the deposit exceeds the line total — the cashier resolves
 * that via `depositRefund`).
 *
 * Rolls flip to `reserved`. If the resulting balance is exactly zero, the
 * invoice closes to `closed_pending_pickup` and the rolls flip to `sold`,
 * mirroring the existing `addFinalPayment` close path.
 */
export async function addLinesToOpenInvoice(
  invoiceId: number,
  actorUserId: number,
  input: AddLinesInput,
): Promise<{ invoice: Invoice }> {
  if (input.lines.length === 0) throw new Error('NO_LINES_PROVIDED');

  const rollIds = input.lines.map((l) => l.rollId);
  if (new Set(rollIds).size !== rollIds.length) throw new Error('DUPLICATE_ROLL_IN_CART');

  return db.transaction(async (trx) => {
    const settings = await readTaxSettings(trx);

    const invoice = await trx('invoices').where({ id: invoiceId }).forUpdate().first();
    if (!invoice) throw new Error('INVOICE_NOT_FOUND');
    if (invoice.status !== 'open') throw new Error('INVOICE_NOT_OPEN');

    const destination: FulfillmentDestination =
      (invoice.fulfillment_destination as FulfillmentDestination) ?? 'shop';

    // Lock + validate rolls. Mirrors invoices.service.lockAndValidateRolls
    // but inline (no cross-module import needed).
    const lockedRows = await trx('rolls as r')
      .join('fabrics as f', 'r.fabric_id', 'f.id')
      .whereIn('r.id', rollIds)
      .select(
        'r.id',
        'r.selling_price_egp',
        'r.reference_price_per_unit',
        'r.weight_kg',
        'r.length_m',
        'r.status',
        'r.warehouse',
        'r.is_visible_at_pos',
        'f.unit as fabric_unit',
      )
      .forUpdate();
    const locked = new Map<number, RollPricingInfo & { id: number }>();
    for (const row of lockedRows) {
      locked.set(row.id as number, {
        ...row,
        fabric_unit: row.fabric_unit as 'kg' | 'meter',
        selling_price_egp: row.selling_price_egp == null ? null : String(row.selling_price_egp),
        reference_price_per_unit:
          row.reference_price_per_unit == null ? null : String(row.reference_price_per_unit),
        weight_kg: row.weight_kg == null ? null : String(row.weight_kg),
        length_m: row.length_m == null ? null : String(row.length_m),
        warehouse: String(row.warehouse),
        status: String(row.status),
        is_visible_at_pos: Boolean(row.is_visible_at_pos),
      });
    }
    for (const id of rollIds) {
      const r = locked.get(id);
      if (!r) throw new Error('ROLL_NOT_FOUND');
      if (r.status !== 'in_stock') throw new Error('ROLL_NOT_AVAILABLE');
      if (!r.is_visible_at_pos) throw new Error('ROLL_NOT_VISIBLE_AT_POS');
      if (destination === 'factory_direct') {
        if (r.warehouse !== 'factory') throw new Error('ROLL_NOT_AT_FACTORY');
      } else {
        if (r.warehouse !== 'shop' && r.warehouse !== 'damaged_shop') {
          throw new Error('ROLL_NOT_AT_SHOP');
        }
      }
    }

    // Compute per-line totals using the same rules as createSale.
    const lines = input.lines.map((l) => {
      const info = locked.get(l.rollId)!;
      const saleQuantity = resolveRollSaleQuantity(info);
      const qty = saleQuantity.quantity;
      let perUnit: number;
      let absolutePrice: number;
      if (l.finalPricePerUnit != null) {
        perUnit = Number(l.finalPricePerUnit);
        absolutePrice = perUnit * qty;
      } else if (l.sellingPriceOverride != null) {
        absolutePrice = Number(l.sellingPriceOverride);
        perUnit = qty > 0 ? absolutePrice / qty : 0;
      } else {
        throw new Error('LINE_PRICE_REQUIRED');
      }
      if (!Number.isFinite(absolutePrice) || absolutePrice <= 0) {
        throw new Error('LINE_PRICE_REQUIRED');
      }
      const lineDiscount = roundEgp(Number(l.lineDiscountEgp ?? 0));
      if (lineDiscount > absolutePrice) throw new Error('LINE_DISCOUNT_EXCEEDS_PRICE');
      const lineTotal = roundEgp(absolutePrice - lineDiscount);
      return {
        rollId: l.rollId,
        selling_price_egp: roundEgp(absolutePrice),
        final_price_per_unit: roundEgp(perUnit),
        sold_quantity: qty,
        sold_unit: saleQuantity.unit,
        line_discount_egp: lineDiscount,
        line_total_egp: lineTotal,
      };
    });

    const subtotal = roundEgp(lines.reduce((s, l) => s + l.line_total_egp, 0));

    let cartDiscount = 0;
    let beforeTax = subtotal;
    if (input.cartTargetFinal != null) {
      const c = backCalculateDiscount(subtotal, Number(input.cartTargetFinal));
      cartDiscount = c.cart_discount_egp;
      beforeTax = roundEgp(subtotal - cartDiscount);
    }
    const tax = settings.taxEnabled ? roundEgp(beforeTax * settings.taxRate) : 0;
    const rawTotal = beforeTax + tax;
    const total = roundEgp(rawTotal);
    const rounding = roundEgp(total - rawTotal);

    const paid = roundEgp(Number(invoice.paid_egp));
    const newBalance = roundEgp(total - paid);
    const EPS_ = 0.001;
    const isClosed = Math.abs(newBalance) < EPS_;
    const newRollStatus: 'sold' | 'reserved' = isClosed ? 'sold' : 'reserved';
    const newEventType: 'sale_out' | 'reserve' = isClosed ? 'sale_out' : 'reserve';

    // Insert invoice lines.
    await trx('invoice_lines').insert(
      lines.map((l) => ({
        invoice_id: invoiceId,
        roll_id: l.rollId,
        selling_price_egp: l.selling_price_egp,
        final_price_per_unit: l.final_price_per_unit,
        sold_quantity: l.sold_quantity,
        sold_unit: l.sold_unit,
        line_discount_egp: l.line_discount_egp,
        line_total_egp: l.line_total_egp,
      })),
    );

    // Flip roll status, persist per-roll final price, emit movement.
    for (const l of lines) {
      await trx('rolls').where({ id: l.rollId }).update({
        status: newRollStatus,
        selling_price_egp: l.selling_price_egp,
        updated_at: trx.fn.now(),
      });
      await trx('stock_movements').insert({
        roll_id: l.rollId,
        from_warehouse: locked.get(l.rollId)!.warehouse,
        to_warehouse: null,
        event_type: newEventType,
        reference_type: 'invoice',
        reference_id: invoiceId,
        actor_user_id: actorUserId,
      });
    }

    // Audit each price override individually.
    for (let i = 0; i < input.lines.length; i++) {
      const inp = input.lines[i]!;
      const computed = lines[i]!;
      const lockedRoll = locked.get(inp.rollId)!;
      const referencePerUnit =
        lockedRoll.reference_price_per_unit == null
          ? null
          : Number(lockedRoll.reference_price_per_unit);
      await auditFromService(trx, {
        actorUserId,
        action: 'pos_price_override',
        entity: 'roll',
        entityId: inp.rollId,
        before: { reference_price_per_unit: referencePerUnit },
        after: {
          final_price_per_unit: computed.final_price_per_unit,
          line_total_egp: computed.line_total_egp,
          invoice_id: invoiceId,
        },
        severity: 'medium',
      });
    }

    // Adjust customer lifetime_volume + balance for the delta between the
    // previous total (deposit placeholder, or any prior sum-of-lines value)
    // and the new total.
    const customer = await trx('customers')
      .where({ id: invoice.customer_id })
      .forUpdate()
      .first();
    if (!customer) throw new Error('CUSTOMER_NOT_FOUND');
    const previousTotal = roundEgp(Number(invoice.total_egp));
    const delta = roundEgp(total - previousTotal);
    if (Math.abs(delta) > EPS_) {
      const newLifetime = roundEgp(Number(customer.lifetime_volume_egp) + delta);
      const newCustomerBalance = roundEgp(Number(customer.current_balance_egp) - delta);
      await trx('customer_ledger_entries').insert({
        customer_id: invoice.customer_id,
        entry_type: 'adjustment',
        reference_type: 'invoice',
        reference_id: invoiceId,
        amount_egp: -delta,
        balance_after_egp: newCustomerBalance,
        notes_ar: `تعديل الإجمالي بعد إضافة بنود لفاتورة ${invoice.invoice_no}`,
        actor_user_id: actorUserId,
      });
      await trx('customers').where({ id: invoice.customer_id }).update({
        current_balance_egp: newCustomerBalance,
        lifetime_volume_egp: newLifetime,
        updated_at: trx.fn.now(),
      });
    }

    const newStatus: InvoiceStatus = isClosed ? 'closed_pending_pickup' : 'open';

    await trx('invoices').where({ id: invoiceId }).update({
      subtotal_egp: subtotal,
      cart_discount_egp: cartDiscount,
      tax_egp: tax,
      rounding_egp: rounding,
      total_egp: total,
      balance_egp: newBalance,
      status: newStatus,
      closed_at: isClosed ? trx.fn.now() : invoice.closed_at,
    });

    if (isClosed) {
      await appendStatusHistory(
        trx,
        invoiceId,
        'open',
        'closed_pending_pickup',
        actorUserId,
        'إغلاق الفاتورة بعد إضافة البنود (الباقي = 0)',
      );
    }

    await auditFromService(trx, {
      actorUserId,
      action: 'open_invoice_lines_added',
      entity: 'invoice',
      entityId: invoiceId,
      before: { total_egp: previousTotal, status: invoice.status },
      after: {
        total_egp: total,
        balance_egp: newBalance,
        status: newStatus,
        lines_added: lines.length,
      },
      severity: 'medium',
    });

    const updated = await trx('invoices').where({ id: invoiceId }).first();
    return { invoice: updated as Invoice };
  });
}

/**
 * v2 Phase 5 — refund the over-deposit portion of an open invoice.
 *
 * Preconditions:
 *  - invoice.status === 'open'
 *  - amount > 0 and amount <= paid_egp − total_egp (over-deposit only)
 *
 * Side effects: writes a negative `payments` row, settles a cash/bank outflow,
 * updates `paid_egp` and `balance_egp`, flips status to `deposit_refunded`,
 * flips any reserved rolls on the invoice to `sold` (the invoice is finalised
 * line-wise), and audits.
 */
export async function depositRefund(
  invoiceId: number,
  actorUserId: number,
  input: DepositRefundInput,
): Promise<{ invoice: Invoice }> {
  const refundAmount = roundEgp(Number(input.amountEgp));
  if (refundAmount <= 0) throw new Error('REFUND_AMOUNT_INVALID');

  return db.transaction(async (trx) => {
    const { invoice, rollIds } = await lockInvoiceWithLines(trx, invoiceId);
    if (invoice.status !== 'open') throw new Error('INVOICE_NOT_OPEN');

    const total = roundEgp(Number(invoice.total_egp));
    const paid = roundEgp(Number(invoice.paid_egp));
    const overDeposit = roundEgp(paid - total);
    if (overDeposit <= 0) throw new Error('NO_OVER_DEPOSIT');
    if (refundAmount > overDeposit + EPS) throw new Error('REFUND_EXCEEDS_OVER_DEPOSIT');

    // Resolve bank account for instapay/bank_transfer refunds.
    let refundBankId: number | null = null;
    if (input.method === 'instapay' || input.method === 'bank_transfer') {
      if (input.bankAccountId != null) {
        const acc = await trx('bank_accounts')
          .where({ id: input.bankAccountId, is_active: true })
          .first();
        if (!acc) throw new Error('NO_DEFAULT_BANK_ACCOUNT');
        refundBankId = acc.id as number;
      } else {
        const def = await trx('bank_accounts')
          .where({ is_default: true, is_active: true })
          .first();
        if (!def) throw new Error('NO_DEFAULT_BANK_ACCOUNT');
        refundBankId = def.id as number;
      }
    }

    // Insert the negative-payment row + settle the cash/bank outflow.
    const [{ id: paymentId }] = await trx('payments').insert({
      invoice_id: invoiceId,
      method: input.method,
      amount_egp: -refundAmount,
      payment_kind: 'refund',
      bank_account_id: refundBankId,
      reference: input.reference ?? null,
      notes_ar: 'استرجاع الدفعة المقدمة',
      actor_user_id: actorUserId,
    }).returning('id');
    if (input.method === 'cheque' && input.chequeDetails) {
      await trx('cheques').insert({
        payment_id: paymentId,
        cheque_number: input.chequeDetails.chequeNumber,
        bank_name_ar: input.chequeDetails.bankNameAr,
        branch_ar: input.chequeDetails.branchAr ?? null,
        issuer_name_ar: input.chequeDetails.issuerNameAr ?? null,
        amount_egp: refundAmount,
        issue_date: input.chequeDetails.issueDate,
        due_date: input.chequeDetails.dueDate,
        notes_ar: input.chequeDetails.notesAr ?? null,
      });
    }
    await settlePayment(trx, {
      method: input.method,
      paymentKind: 'refund',
      amount: refundAmount,
      bankAccountId: refundBankId,
      referenceType: 'invoice',
      referenceId: invoiceId,
      actorUserId,
      notesAr: 'استرجاع الدفعة المقدمة',
    });

    // Customer ledger — refund mirrors the payment direction (a negative
    // payment reduces the customer-credit position).
    const customer = await trx('customers')
      .where({ id: invoice.customer_id })
      .forUpdate()
      .first();
    if (!customer) throw new Error('CUSTOMER_NOT_FOUND');
    const newCustomerBalance = roundEgp(Number(customer.current_balance_egp) - refundAmount);
    await trx('customer_ledger_entries').insert({
      customer_id: invoice.customer_id,
      entry_type: 'refund',
      reference_type: 'invoice',
      reference_id: invoiceId,
      amount_egp: -refundAmount,
      balance_after_egp: newCustomerBalance,
      notes_ar: `استرجاع دفعة لفاتورة ${invoice.invoice_no}`,
      actor_user_id: actorUserId,
    });
    await trx('customers').where({ id: invoice.customer_id }).update({
      current_balance_egp: newCustomerBalance,
      updated_at: trx.fn.now(),
    });

    const newPaid = roundEgp(paid - refundAmount);
    const newBalance = roundEgp(total - newPaid);
    const fullyRefunded = Math.abs(newBalance) < EPS;

    // If this refund settles the balance to zero, the invoice is done — flip
    // any reserved rolls to sold and stamp deposit_refunded.
    //
    // Accessories are intentionally not restored here: a deposit refund settles
    // the balance and finalises the invoice, so the goods are being handed over,
    // not returned. Only cancelOpenInvoice / voidInvoice put pieces back.
    if (fullyRefunded && rollIds.length > 0) {
      for (const rollId of rollIds) {
        const r = await trx('rolls').where({ id: rollId }).first();
        if (r && r.status === 'reserved') {
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
            notes_ar: 'إغلاق بعد استرجاع الدفعة',
          });
        }
      }
    }

    const newStatus: InvoiceStatus = fullyRefunded ? 'deposit_refunded' : 'open';
    await trx('invoices').where({ id: invoiceId }).update({
      paid_egp: newPaid,
      balance_egp: newBalance,
      status: newStatus,
      closed_at: fullyRefunded ? trx.fn.now() : invoice.closed_at,
    });

    if (fullyRefunded) {
      await appendStatusHistory(
        trx,
        invoiceId,
        'open',
        'deposit_refunded',
        actorUserId,
        `استرجاع ${refundAmount.toFixed(2)} ج.م`,
      );
    }

    await auditFromService(trx, {
      actorUserId,
      action: 'deposit_refund',
      entity: 'invoice',
      entityId: invoiceId,
      before: { paid_egp: paid, balance_egp: Number(invoice.balance_egp), status: invoice.status },
      after: {
        invoiceId,
        refundEgp: refundAmount,
        method: input.method,
        paid_egp: newPaid,
        balance_egp: newBalance,
        status: newStatus,
      },
      severity: 'medium',
    });

    const updated = await trx('invoices').where({ id: invoiceId }).first();
    return { invoice: updated as Invoice };
  });
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
