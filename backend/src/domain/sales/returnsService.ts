import { db } from '../../db/connection.js';
import { auditFromService } from '../inventory/audit.helper.js';
import { notify } from '../notifications/notificationsService.js';
import { getSetting } from '../settings/settings.service.js';
import { roundEgp } from './discountCalculator.js';
import { nextReturnNo } from './returnNumber.service.js';
import { settlePayment } from '../finance/paymentSettlementService.js';
import { createSale } from './invoices.service.js';
import type { CreateSaleInput } from './sales.types.js';

export type ReturnLineInput = {
  originalLineId: number;
  rollId: number;
  refundAmountEgp: number;
  disposition: 'back_to_stock' | 'damaged';
  notesAr?: string | null;
};

export type ProcessReturnInput = {
  originalInvoiceId: number;
  lines: ReturnLineInput[];
  refundMethod: 'cash' | 'instapay' | 'customer_credit';
  bankAccountId?: number | null;
  notesAr?: string | null;
  actorUserId: number;
  actorRole: string;
  ownerWindowOverride?: boolean;
};

export type ProcessExchangeInput = ProcessReturnInput & {
  newCartLines: CreateSaleInput['lines'];
  newCartPayments: CreateSaleInput['payments'];
  newCartTargetFinal?: number | null;
  newCartNotesAr?: string | null;
};

export type ReturnRow = {
  id: number;
  return_no: string;
  original_invoice_id: number;
  customer_id: number;
  created_by_user_id: number;
  processed_at: string;
  total_refund_egp: string;
  refund_method: 'cash' | 'instapay' | 'customer_credit';
  bank_account_id: number | null;
  notes_ar: string | null;
  kind: 'refund' | 'exchange';
  exchange_new_invoice_id: number | null;
};

export type ReturnLineRow = {
  id: number;
  return_id: number;
  original_invoice_line_id: number;
  roll_id: number;
  refund_amount_egp: string;
  roll_disposition: 'back_to_stock' | 'damaged';
  notes_ar: string | null;
  fabric_name_ar: string;
  color_name_ar: string;
  color_code: string | null;
  roll_sr_no: string | null;
  weight_kg: string;
  internal_barcode: string;
};

export type ReturnDetail = ReturnRow & {
  original_invoice_no: string;
  customer_name_ar: string;
  customer_phone: string;
  customer_code: string;
  actor_username: string;
  lines: ReturnLineRow[];
};

export type ListReturnsQuery = {
  page: number;
  limit: number;
  customer_id?: number;
  original_invoice_id?: number;
  date_from?: string;
  date_to?: string;
};

async function validateReturnWindow(
  originalInvoiceId: number,
  actorRole: string,
  ownerWindowOverride: boolean,
  trx: import('knex').Knex.Transaction,
): Promise<void> {
  const returnWindowDays = await getSetting<number>(trx, 'return_window_days', 14);
  const invoice = await trx('invoices').where({ id: originalInvoiceId }).first();
  if (!invoice) throw new Error('INVOICE_NOT_FOUND');
  if (invoice.status !== 'completed') throw new Error('INVOICE_NOT_COMPLETED');

  const completedAt = invoice.closed_at ?? invoice.created_at;
  const nowMs = Date.now();
  const completedMs = new Date(completedAt as string).getTime();
  const diffDays = (nowMs - completedMs) / 86_400_000;

  if (diffDays > returnWindowDays) {
    if (actorRole !== 'owner' && !ownerWindowOverride) {
      throw new Error('RETURN_WINDOW_EXPIRED');
    }
  }
}

export async function processReturn(input: ProcessReturnInput): Promise<ReturnRow> {
  return db.transaction(async (trx) => {
    await validateReturnWindow(
      input.originalInvoiceId,
      input.actorRole,
      input.ownerWindowOverride ?? false,
      trx,
    );

    const invoice = await trx('invoices').where({ id: input.originalInvoiceId }).forUpdate().first();

    // Validate each return line: roll must belong to the original invoice and be sold.
    const invoiceLineIds = input.lines.map((l) => l.originalLineId);
    const invoiceLines = await trx('invoice_lines')
      .where({ invoice_id: input.originalInvoiceId })
      .whereIn('id', invoiceLineIds);

    if (invoiceLines.length !== input.lines.length) {
      throw new Error('RETURN_LINE_NOT_ON_INVOICE');
    }

    const rollIds = input.lines.map((l) => l.rollId);
    const rolls = await trx('rolls').whereIn('id', rollIds).forUpdate();
    for (const roll of rolls) {
      if (roll.status !== 'sold') throw new Error('ROLL_NOT_SOLD');
    }
    const rollMap = new Map(rolls.map((r) => [Number(r.id), r]));

    // Validate roll IDs match lines.
    for (const line of input.lines) {
      const invLine = invoiceLines.find((il) => Number(il.id) === line.originalLineId);
      if (!invLine || Number(invLine.roll_id) !== line.rollId) {
        throw new Error('RETURN_LINE_ROLL_MISMATCH');
      }
    }

    const totalRefund = roundEgp(input.lines.reduce((s, l) => s + l.refundAmountEgp, 0));
    const year = new Date().getFullYear();
    const return_no = await nextReturnNo(trx, year);

    const [ret] = await trx('returns')
      .insert({
        return_no,
        original_invoice_id: input.originalInvoiceId,
        customer_id: invoice.customer_id,
        created_by_user_id: input.actorUserId,
        total_refund_egp: totalRefund,
        refund_method: input.refundMethod,
        bank_account_id: input.bankAccountId ?? null,
        notes_ar: input.notesAr ?? null,
        kind: 'refund',
      })
      .returning('*');

    // Process each return line.
    for (const line of input.lines) {
      await trx('return_lines').insert({
        return_id: ret.id,
        original_invoice_line_id: line.originalLineId,
        roll_id: line.rollId,
        refund_amount_egp: roundEgp(line.refundAmountEgp),
        roll_disposition: line.disposition,
        notes_ar: line.notesAr ?? null,
      });

      const roll = rollMap.get(line.rollId)!;

      if (line.disposition === 'back_to_stock') {
        await trx('rolls').where({ id: line.rollId }).update({
          status: 'in_stock',
          updated_at: trx.fn.now(),
        });
        await trx('stock_movements').insert({
          roll_id: line.rollId,
          from_warehouse: null,
          to_warehouse: roll.warehouse,
          event_type: 'return_in',
          reference_type: 'return',
          reference_id: ret.id,
          actor_user_id: input.actorUserId,
          notes_ar: `مرتجع: ${return_no}`,
        });
      } else {
        // damaged: flip to damaged status and move to damaged_shop warehouse.
        await trx('rolls').where({ id: line.rollId }).update({
          status: 'damaged',
          warehouse: 'damaged_shop',
          updated_at: trx.fn.now(),
        });
        await trx('stock_movements').insert({
          roll_id: line.rollId,
          from_warehouse: null,
          to_warehouse: 'damaged_shop',
          event_type: 'return_in',
          reference_type: 'return',
          reference_id: ret.id,
          actor_user_id: input.actorUserId,
          notes_ar: `مرتجع تالف: ${return_no}`,
        });
        await trx('stock_movements').insert({
          roll_id: line.rollId,
          from_warehouse: 'damaged_shop',
          to_warehouse: 'damaged_shop',
          event_type: 'damage',
          reference_type: 'return',
          reference_id: ret.id,
          actor_user_id: input.actorUserId,
          notes_ar: `تالف مرتجع: ${return_no}`,
        });
      }
    }

    // Handle refund payment / customer credit.
    if (input.refundMethod !== 'customer_credit') {
      await trx('payments').insert({
        invoice_id: input.originalInvoiceId,
        method: input.refundMethod,
        amount_egp: -totalRefund,
        payment_kind: 'refund',
        bank_account_id: input.bankAccountId ?? null,
        notes_ar: `استرجاع: ${return_no}`,
        actor_user_id: input.actorUserId,
      });
      await settlePayment(trx, {
        method: input.refundMethod as 'cash' | 'instapay',
        paymentKind: 'refund',
        amount: totalRefund,
        bankAccountId: input.bankAccountId ?? null,
        referenceType: 'return',
        referenceId: ret.id,
        actorUserId: input.actorUserId,
        notesAr: `استرجاع: ${return_no}`,
      });
    }

    // Customer ledger: update balance + decrement lifetime_volume.
    const customer = await trx('customers').where({ id: invoice.customer_id }).forUpdate().first();
    const newBalance = input.refundMethod === 'customer_credit'
      ? roundEgp(Number(customer.current_balance_egp) + totalRefund)
      : Number(customer.current_balance_egp);
    const newLifetime = roundEgp(Number(customer.lifetime_volume_egp) - totalRefund);

    await trx('customer_ledger_entries').insert({
      customer_id: invoice.customer_id,
      entry_type: 'refund',
      reference_type: 'return',
      reference_id: ret.id,
      amount_egp: input.refundMethod === 'customer_credit' ? totalRefund : -totalRefund,
      balance_after_egp: newBalance,
      notes_ar: `مرتجع ${return_no} — ${input.refundMethod === 'customer_credit' ? 'رصيد دائن' : 'استرجاع نقدي'}`,
      actor_user_id: input.actorUserId,
    });

    await trx('customers').where({ id: invoice.customer_id }).update({
      current_balance_egp: newBalance,
      lifetime_volume_egp: newLifetime,
      updated_at: trx.fn.now(),
    });

    await auditFromService(trx, {
      actorUserId: input.actorUserId,
      action: 'return_processed',
      entity: 'return',
      entityId: ret.id,
      after: {
        return_no,
        original_invoice_id: input.originalInvoiceId,
        total_refund_egp: totalRefund,
        refund_method: input.refundMethod,
        line_count: input.lines.length,
        owner_window_override: input.ownerWindowOverride ?? false,
      },
      severity: 'medium',
    });

    await notify({
      recipientRole: 'owner',
      severity: 'low',
      eventType: 'return_processed',
      titleAr: 'مرتجع مسجل',
      bodyAr: `تم تسجيل مرتجع رقم ${return_no}`,
      payload: {
        return_no,
        kind: 'refund',
        total_refund_egp: totalRefund,
        refund_method: input.refundMethod,
        original_invoice_id: input.originalInvoiceId,
      },
    });

    return ret as ReturnRow;
  });
}

export async function processExchange(input: ProcessExchangeInput): Promise<{
  returnRow: ReturnRow;
  newInvoice: { id: number; invoice_no: string };
}> {
  // First run the return in its own transaction segment, then create the new sale.
  const returnRow = await db.transaction(async (trx) => {
    await validateReturnWindow(
      input.originalInvoiceId,
      input.actorRole,
      input.ownerWindowOverride ?? false,
      trx,
    );

    const invoice = await trx('invoices').where({ id: input.originalInvoiceId }).forUpdate().first();
    const invoiceLineIds = input.lines.map((l) => l.originalLineId);
    const invoiceLines = await trx('invoice_lines')
      .where({ invoice_id: input.originalInvoiceId })
      .whereIn('id', invoiceLineIds);
    if (invoiceLines.length !== input.lines.length) throw new Error('RETURN_LINE_NOT_ON_INVOICE');

    const rollIds = input.lines.map((l) => l.rollId);
    const rolls = await trx('rolls').whereIn('id', rollIds).forUpdate();
    for (const roll of rolls) {
      if (roll.status !== 'sold') throw new Error('ROLL_NOT_SOLD');
    }
    const rollMap = new Map(rolls.map((r) => [Number(r.id), r]));

    for (const line of input.lines) {
      const invLine = invoiceLines.find((il) => Number(il.id) === line.originalLineId);
      if (!invLine || Number(invLine.roll_id) !== line.rollId) {
        throw new Error('RETURN_LINE_ROLL_MISMATCH');
      }
    }

    const totalRefund = roundEgp(input.lines.reduce((s, l) => s + l.refundAmountEgp, 0));
    const year = new Date().getFullYear();
    const return_no = await nextReturnNo(trx, year);

    const [ret] = await trx('returns')
      .insert({
        return_no,
        original_invoice_id: input.originalInvoiceId,
        customer_id: invoice.customer_id,
        created_by_user_id: input.actorUserId,
        total_refund_egp: totalRefund,
        refund_method: input.refundMethod,
        bank_account_id: input.bankAccountId ?? null,
        notes_ar: input.notesAr ?? null,
        kind: 'exchange',
      })
      .returning('*');

    for (const line of input.lines) {
      await trx('return_lines').insert({
        return_id: ret.id,
        original_invoice_line_id: line.originalLineId,
        roll_id: line.rollId,
        refund_amount_egp: roundEgp(line.refundAmountEgp),
        roll_disposition: line.disposition,
        notes_ar: line.notesAr ?? null,
      });

      const roll = rollMap.get(line.rollId)!;
      if (line.disposition === 'back_to_stock') {
        await trx('rolls').where({ id: line.rollId }).update({
          status: 'in_stock',
          updated_at: trx.fn.now(),
        });
        await trx('stock_movements').insert({
          roll_id: line.rollId,
          from_warehouse: null,
          to_warehouse: roll.warehouse,
          event_type: 'return_in',
          reference_type: 'return',
          reference_id: ret.id,
          actor_user_id: input.actorUserId,
          notes_ar: `استبدال مرتجع: ${return_no}`,
        });
      } else {
        await trx('rolls').where({ id: line.rollId }).update({
          status: 'damaged',
          warehouse: 'damaged_shop',
          updated_at: trx.fn.now(),
        });
        await trx('stock_movements').insert({
          roll_id: line.rollId,
          from_warehouse: null,
          to_warehouse: 'damaged_shop',
          event_type: 'return_in',
          reference_type: 'return',
          reference_id: ret.id,
          actor_user_id: input.actorUserId,
          notes_ar: `استبدال مرتجع تالف: ${return_no}`,
        });
        await trx('stock_movements').insert({
          roll_id: line.rollId,
          from_warehouse: 'damaged_shop',
          to_warehouse: 'damaged_shop',
          event_type: 'damage',
          reference_type: 'return',
          reference_id: ret.id,
          actor_user_id: input.actorUserId,
          notes_ar: `تالف استبدال: ${return_no}`,
        });
      }
    }

    if (input.refundMethod !== 'customer_credit') {
      await trx('payments').insert({
        invoice_id: input.originalInvoiceId,
        method: input.refundMethod,
        amount_egp: -totalRefund,
        payment_kind: 'refund',
        bank_account_id: input.bankAccountId ?? null,
        notes_ar: `استرجاع استبدال: ${return_no}`,
        actor_user_id: input.actorUserId,
      });
      await settlePayment(trx, {
        method: input.refundMethod as 'cash' | 'instapay',
        paymentKind: 'refund',
        amount: totalRefund,
        bankAccountId: input.bankAccountId ?? null,
        referenceType: 'return',
        referenceId: ret.id,
        actorUserId: input.actorUserId,
        notesAr: `استرجاع استبدال: ${return_no}`,
      });
    }

    const customer = await trx('customers').where({ id: invoice.customer_id }).forUpdate().first();
    const newBalance = input.refundMethod === 'customer_credit'
      ? roundEgp(Number(customer.current_balance_egp) + totalRefund)
      : Number(customer.current_balance_egp);
    const newLifetime = roundEgp(Number(customer.lifetime_volume_egp) - totalRefund);

    await trx('customer_ledger_entries').insert({
      customer_id: invoice.customer_id,
      entry_type: 'refund',
      reference_type: 'return',
      reference_id: ret.id,
      amount_egp: input.refundMethod === 'customer_credit' ? totalRefund : -totalRefund,
      balance_after_egp: newBalance,
      notes_ar: `استبدال ${return_no}`,
      actor_user_id: input.actorUserId,
    });
    await trx('customers').where({ id: invoice.customer_id }).update({
      current_balance_egp: newBalance,
      lifetime_volume_egp: newLifetime,
      updated_at: trx.fn.now(),
    });

    await auditFromService(trx, {
      actorUserId: input.actorUserId,
      action: 'exchange_processed',
      entity: 'return',
      entityId: ret.id,
      after: {
        return_no,
        kind: 'exchange',
        original_invoice_id: input.originalInvoiceId,
        total_refund_egp: totalRefund,
        refund_method: input.refundMethod,
      },
      severity: 'medium',
    });

    return ret as ReturnRow;
  });

  // Create the new sale (own transaction inside createSale).
  const newInvoice = await createSale(input.actorUserId, {
    customerId: returnRow.customer_id,
    lines: input.newCartLines,
    payments: input.newCartPayments,
    cartTargetFinal: input.newCartTargetFinal ?? null,
    notesAr: input.newCartNotesAr ?? `استبدال من: ${returnRow.return_no}`,
  });

  // Link the new invoice to the return record.
  await db('returns').where({ id: returnRow.id }).update({
    exchange_new_invoice_id: newInvoice.id,
  });

  await notify({
    recipientRole: 'owner',
    severity: 'low',
    eventType: 'return_processed',
    titleAr: 'استبدال مسجل',
    bodyAr: `تم تسجيل استبدال رقم ${returnRow.return_no}`,
    payload: {
      return_no: returnRow.return_no,
      kind: 'exchange',
      new_invoice_id: newInvoice.id,
      original_invoice_id: input.originalInvoiceId,
    },
  });

  return { returnRow: { ...returnRow, exchange_new_invoice_id: newInvoice.id }, newInvoice };
}

export async function getReturnDetail(id: number): Promise<ReturnDetail | undefined> {
  const ret = await db('returns as r')
    .where('r.id', id)
    .leftJoin('invoices as inv', 'r.original_invoice_id', 'inv.id')
    .leftJoin('customers as c', 'r.customer_id', 'c.id')
    .leftJoin('users as u', 'r.created_by_user_id', 'u.id')
    .select(
      'r.*',
      'inv.invoice_no as original_invoice_no',
      'c.name_ar as customer_name_ar',
      'c.phone as customer_phone',
      'c.customer_code',
      'u.username as actor_username',
    )
    .first();
  if (!ret) return undefined;

  const lines = await db('return_lines as rl')
    .where('rl.return_id', id)
    .join('rolls as ro', 'rl.roll_id', 'ro.id')
    .join('fabrics as f', 'ro.fabric_id', 'f.id')
    .join('colors as col', 'ro.color_id', 'col.id')
    .select(
      'rl.*',
      'f.name_ar as fabric_name_ar',
      'col.name_ar as color_name_ar',
      'col.code as color_code',
      'ro.roll_sr_no',
      'ro.weight_kg',
      'ro.internal_barcode',
    )
    .orderBy('rl.id', 'asc');

  return { ...ret, lines } as ReturnDetail;
}

export async function listReturns(
  q: ListReturnsQuery,
): Promise<{ rows: Array<ReturnRow & { original_invoice_no: string; customer_name_ar: string }>; total: number }> {
  const offset = (q.page - 1) * q.limit;
  const base = db('returns as r')
    .leftJoin('invoices as inv', 'r.original_invoice_id', 'inv.id')
    .leftJoin('customers as c', 'r.customer_id', 'c.id')
    .select('r.*', 'inv.invoice_no as original_invoice_no', 'c.name_ar as customer_name_ar');

  if (q.customer_id) base.where('r.customer_id', q.customer_id);
  if (q.original_invoice_id) base.where('r.original_invoice_id', q.original_invoice_id);
  if (q.date_from) base.where('r.processed_at', '>=', q.date_from);
  if (q.date_to) base.where('r.processed_at', '<=', q.date_to);

  const [countRow] = await base.clone().clearSelect().count<Array<{ count: string }>>('r.id as count');
  const rows = await base.orderBy('r.processed_at', 'desc').limit(q.limit).offset(offset);
  return {
    rows: rows as Array<ReturnRow & { original_invoice_no: string; customer_name_ar: string }>,
    total: Number((countRow as { count: string }).count),
  };
}
