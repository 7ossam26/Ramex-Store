import { db } from '../../db/connection.js';
import { formatCairo } from '../../lib/datetime/cairo.js';
import type { DailyReport } from '../reports/dailyReportService.js';

function fmtEgp(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toFixed(2);
}

export async function shiftReportService(shiftId: number): Promise<DailyReport> {
  const shift = await db('shifts').where({ id: shiftId }).first();
  if (!shift) throw new Error('SHIFT_NOT_FOUND');

  const startIso = new Date(shift.opened_at).toISOString();
  // If shift is still open, use now as the end boundary
  const endIso = shift.closed_at
    ? new Date(shift.closed_at).toISOString()
    : new Date().toISOString();

  // ─── 1. Sales summary ───────────────────────────────────────────────────────
  const completedInvoices = await db('invoices')
    .where('status', 'completed')
    .where('shift_id', shiftId)
    .select(
      db.raw('COUNT(*) as invoice_count'),
      db.raw('COALESCE(SUM(subtotal_egp), 0) as gross_subtotal_egp'),
      db.raw('COALESCE(SUM(cart_discount_egp), 0) as total_cart_discount_egp'),
      db.raw('COALESCE(SUM(tax_egp), 0) as total_tax_egp'),
      db.raw('COALESCE(SUM(total_egp), 0) as total_net_egp'),
    )
    .first() as Record<string, string>;

  const refundsAgg = await db('returns')
    .where('shift_id', shiftId)
    .where('kind', 'refund')
    .select(
      db.raw('COUNT(*) as refund_count'),
      db.raw('COALESCE(SUM(total_refund_egp), 0) as refund_total_egp'),
    )
    .first() as Record<string, string>;

  const voidsAgg = await db('invoices')
    .where('status', 'cancelled')
    .where('shift_id', shiftId)
    .select(
      db.raw('COUNT(*) as void_count'),
      db.raw('COALESCE(SUM(total_egp), 0) as void_total_egp'),
    )
    .first() as Record<string, string>;

  const salesSummary = {
    invoice_count: Number(completedInvoices?.invoice_count ?? 0),
    gross_subtotal_egp: fmtEgp(completedInvoices?.gross_subtotal_egp),
    total_cart_discount_egp: fmtEgp(completedInvoices?.total_cart_discount_egp),
    total_tax_egp: fmtEgp(completedInvoices?.total_tax_egp),
    total_net_egp: fmtEgp(completedInvoices?.total_net_egp),
    refund_count: Number(refundsAgg?.refund_count ?? 0),
    refund_total_egp: fmtEgp(refundsAgg?.refund_total_egp),
    void_count: Number(voidsAgg?.void_count ?? 0),
    void_total_egp: fmtEgp(voidsAgg?.void_total_egp),
  };

  // ─── 2. Discounts breakdown ──────────────────────────────────────────────────
  const discountRows = await db('invoices as i')
    .leftJoin(
      db('invoice_lines')
        .groupBy('invoice_id')
        .select('invoice_id', db.raw('COALESCE(SUM(line_discount_egp), 0) as line_discounts_egp'))
        .as('ld'),
      'i.id',
      'ld.invoice_id',
    )
    .where('i.status', 'completed')
    .where('i.shift_id', shiftId)
    .where((qb) => {
      qb.where(db.raw('i.cart_discount_egp'), '>', 0).orWhere(
        db.raw('COALESCE(ld.line_discounts_egp, 0)'),
        '>',
        0,
      );
    })
    .select(
      'i.invoice_no',
      'i.cart_discount_egp',
      db.raw('COALESCE(ld.line_discounts_egp, 0) as line_discounts_egp'),
      db.raw('i.cart_discount_egp + COALESCE(ld.line_discounts_egp, 0) as total_discount_egp'),
    );

  const discounts = discountRows.map((r: Record<string, unknown>) => ({
    invoice_no: String(r['invoice_no']),
    cart_discount_egp: fmtEgp(r['cart_discount_egp'] as string),
    line_discounts_egp: fmtEgp(r['line_discounts_egp'] as string),
    total_discount_egp: fmtEgp(r['total_discount_egp'] as string),
  }));

  // ─── 3. Refunds + Voids ──────────────────────────────────────────────────────
  const refundRows = await db('returns as r')
    .join('invoices as i', 'r.original_invoice_id', 'i.id')
    .where('r.shift_id', shiftId)
    .where('r.kind', 'refund')
    .select(
      'i.invoice_no',
      'i.id as invoice_id',
      'r.total_refund_egp as amount_egp',
      'r.processed_at as created_at',
      'r.notes_ar',
    );

  const voidRows = await db('invoices')
    .where('status', 'cancelled')
    .where('shift_id', shiftId)
    .select('invoice_no', 'id as invoice_id', 'total_egp as amount_egp', 'created_at', 'notes_ar');

  const refundsVoids = [
    ...refundRows.map((r: Record<string, unknown>) => ({
      type: 'refund' as const,
      invoice_no: String(r['invoice_no']),
      invoice_id: Number(r['invoice_id']),
      amount_egp: fmtEgp(r['amount_egp'] as string),
      created_at: formatCairo(String(r['created_at'])),
      notes_ar: r['notes_ar'] as string | null,
    })),
    ...voidRows.map((r: Record<string, unknown>) => ({
      type: 'void' as const,
      invoice_no: String(r['invoice_no']),
      invoice_id: Number(r['invoice_id']),
      amount_egp: fmtEgp(r['amount_egp'] as string),
      created_at: formatCairo(String(r['created_at'])),
      notes_ar: r['notes_ar'] as string | null,
    })),
  ];

  // ─── 4. Cash drawer ──────────────────────────────────────────────────────────
  const cashMvts = await db('cash_movements')
    .where('shift_id', shiftId)
    .orderBy('created_at', 'asc')
    .select('direction', 'event_type', 'amount_egp', 'notes_ar', 'created_at');

  const totalIn = cashMvts
    .filter((m: Record<string, unknown>) => m['direction'] === 'in')
    .reduce((s: number, m: Record<string, unknown>) => s + Number(m['amount_egp']), 0);
  const totalOut = cashMvts
    .filter((m: Record<string, unknown>) => m['direction'] === 'out')
    .reduce((s: number, m: Record<string, unknown>) => s + Number(m['amount_egp']), 0);

  const openingBalance = Number(shift.opening_cash_balance_egp ?? 0);

  const cash = {
    opening_balance_egp: fmtEgp(openingBalance),
    total_in_egp: fmtEgp(totalIn),
    total_out_egp: fmtEgp(totalOut),
    closing_balance_egp: fmtEgp(openingBalance + totalIn - totalOut),
    movements: cashMvts.map((m: Record<string, unknown>) => ({
      direction: m['direction'] as 'in' | 'out',
      event_type: String(m['event_type']),
      amount_egp: fmtEgp(m['amount_egp'] as string),
      notes_ar: m['notes_ar'] as string | null,
      created_at: formatCairo(String(m['created_at'])),
    })),
  };

  // ─── 5. Bank vault movements ──────────────────────────────────────────────────
  const bankMvts = await db('bank_movements as bm')
    .join('bank_accounts as ba', 'bm.bank_account_id', 'ba.id')
    .where('bm.shift_id', shiftId)
    .orderBy('bm.created_at', 'asc')
    .select(
      'bm.bank_account_id',
      'ba.name_ar as bank_name_ar',
      'bm.direction',
      'bm.event_type',
      'bm.amount_egp',
      'bm.notes_ar',
      'bm.created_at',
    );

  const bankMovements = bankMvts.map((m: Record<string, unknown>) => ({
    bank_account_id: Number(m['bank_account_id']),
    bank_name_ar: String(m['bank_name_ar']),
    direction: m['direction'] as 'in' | 'out',
    event_type: String(m['event_type']),
    amount_egp: fmtEgp(m['amount_egp'] as string),
    notes_ar: m['notes_ar'] as string | null,
    created_at: formatCairo(String(m['created_at'])),
  }));

  // ─── 6. Sales by fabric+color+roll ───────────────────────────────────────────
  const fabricRows = await db('invoice_lines as il')
    .join('invoices as i', 'il.invoice_id', 'i.id')
    .join('rolls as r', 'il.roll_id', 'r.id')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .join('colors as c', 'r.color_id', 'c.id')
    .where('i.status', 'completed')
    .where('i.shift_id', shiftId)
    .select(
      'f.name_ar as fabric_name_ar',
      'c.name_ar as color_name_ar',
      'r.roll_sr_no',
      'r.weight_kg',
      'il.line_total_egp as revenue_egp',
    )
    .orderBy(['f.name_ar', 'c.name_ar']);

  const salesByFabric = fabricRows.map((r: Record<string, unknown>) => ({
    fabric_name_ar: String(r['fabric_name_ar']),
    color_name_ar: String(r['color_name_ar']),
    roll_sr_no: r['roll_sr_no'] as string | null,
    weight_kg: Number(r['weight_kg']).toFixed(3),
    revenue_egp: fmtEgp(r['revenue_egp'] as string),
  }));

  // ─── 7. Open invoices summary ────────────────────────────────────────────────
  const openedInShift = await db('invoices')
    .whereIn('status', ['open', 'closed_pending_pickup', 'completed'])
    .where('shift_id', shiftId)
    .select(
      db.raw('COUNT(*) as opened_today_count'),
      db.raw('COALESCE(SUM(total_egp), 0) as opened_today_value_egp'),
    )
    .first() as Record<string, string>;

  const closedInShift = await db('invoices')
    .whereIn('status', ['completed', 'closed_pending_pickup'])
    .where('shift_id', shiftId)
    .whereBetween('closed_at', [startIso, endIso])
    .select(
      db.raw('COUNT(*) as closed_today_count'),
      db.raw('COALESCE(SUM(total_egp), 0) as closed_today_value_egp'),
    )
    .first() as Record<string, string>;

  const openInvoicesSummary = {
    opened_today_count: Number(openedInShift?.opened_today_count ?? 0),
    opened_today_value_egp: fmtEgp(openedInShift?.opened_today_value_egp),
    closed_today_count: Number(closedInShift?.closed_today_count ?? 0),
    closed_today_value_egp: fmtEgp(closedInShift?.closed_today_value_egp),
  };

  // ─── 8. Stock movements ──────────────────────────────────────────────────────
  const smRows = await db('stock_movements')
    .whereBetween('created_at', [startIso, endIso])
    .groupBy('event_type')
    .select('event_type', db.raw('COUNT(*) as count'));

  const stockMovements = smRows.map((r: Record<string, unknown>) => ({
    event_type: String(r['event_type']),
    count: Number(r['count']),
  }));

  const cairoLocale = 'en-GB';
  const cairoOptions: Intl.DateTimeFormatOptions = { timeZone: 'Africa/Cairo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
  const shiftDate = new Date(shift.opened_at).toLocaleDateString(cairoLocale, { timeZone: 'Africa/Cairo' });

  return {
    date: shiftDate,
    shift_start_cairo: formatCairo(shift.opened_at),
    shift_end_cairo: shift.closed_at ? formatCairo(shift.closed_at) : 'مفتوحة',
    generated_at: new Date().toLocaleString(cairoLocale, cairoOptions),
    sales_summary: salesSummary,
    discounts,
    refunds_voids: refundsVoids,
    cash,
    bank_movements: bankMovements,
    sales_by_fabric: salesByFabric,
    open_invoices_summary: openInvoicesSummary,
    stock_movements: stockMovements,
  };
}
