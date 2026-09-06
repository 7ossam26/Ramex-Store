import { db } from '../../db/connection.js';
import { cairoDayWindow, formatCairo } from '../../lib/datetime/cairo.js';
import { SALE_REALIZED_STATUSES } from '../sales/sales.types.js';

export type DailySalesSummary = {
  invoice_count: number;
  gross_subtotal_egp: string;
  total_cart_discount_egp: string;
  total_tax_egp: string;
  total_net_egp: string;
  refund_count: number;
  refund_total_egp: string;
  void_count: number;
  void_total_egp: string;
};

export type DailyDiscountLine = {
  invoice_no: string;
  cart_discount_egp: string;
  line_discounts_egp: string;
  total_discount_egp: string;
};

export type DailyRefundVoidLine = {
  type: 'refund' | 'void';
  invoice_no: string;
  invoice_id: number;
  amount_egp: string;
  created_at: string;
  notes_ar: string | null;
};

export type DailyCashMovement = {
  direction: 'in' | 'out';
  event_type: string;
  amount_egp: string;
  notes_ar: string | null;
  created_at: string;
};

export type DailyCashSummary = {
  opening_balance_egp: string;
  total_in_egp: string;
  total_out_egp: string;
  closing_balance_egp: string;
  movements: DailyCashMovement[];
};

export type DailyBankMovement = {
  bank_account_id: number;
  bank_name_ar: string;
  direction: 'in' | 'out';
  event_type: string;
  amount_egp: string;
  notes_ar: string | null;
  created_at: string;
};

export type DailySalesByFabricRow = {
  fabric_name_ar: string;
  color_name_ar: string;
  roll_sr_no: string | null;
  weight_kg: string;
  revenue_egp: string;
};

export type DailyOpenInvoicesSummary = {
  opened_today_count: number;
  opened_today_value_egp: string;
  closed_today_count: number;
  closed_today_value_egp: string;
};

export type DailyStockMovement = {
  event_type: string;
  count: number;
};

export type DailyReport = {
  date: string;
  shift_start_cairo: string;
  shift_end_cairo: string;
  generated_at: string;
  sales_summary: DailySalesSummary;
  discounts: DailyDiscountLine[];
  refunds_voids: DailyRefundVoidLine[];
  cash: DailyCashSummary;
  bank_movements: DailyBankMovement[];
  sales_by_fabric: DailySalesByFabricRow[];
  open_invoices_summary: DailyOpenInvoicesSummary;
  stock_movements: DailyStockMovement[];
};

function fmtEgp(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return v.toFixed(2);
}

export async function getDailyReport(targetDate: string): Promise<DailyReport> {
  const { startUtc, endUtc } = cairoDayWindow(targetDate);

  const startIso = startUtc.toISOString();
  const endIso = endUtc.toISOString();

  // ─── 1. Sales summary ───────────────────────────────────────────────────────
  const completedInvoices = await db('invoices')
    .whereIn('status', SALE_REALIZED_STATUSES as unknown as string[])
    .whereBetween('created_at', [startIso, endIso])
    .select(
      db.raw('COUNT(*) as invoice_count'),
      db.raw('COALESCE(SUM(subtotal_egp), 0) as gross_subtotal_egp'),
      db.raw('COALESCE(SUM(cart_discount_egp + final_discount_egp), 0) as total_cart_discount_egp'),
      db.raw('COALESCE(SUM(tax_egp), 0) as total_tax_egp'),
      db.raw('COALESCE(SUM(total_egp), 0) as total_net_egp'),
    )
    .first() as Record<string, string>;

  const refundsAgg = await db('returns')
    .whereBetween('processed_at', [startIso, endIso])
    .where('kind', 'refund')
    .select(
      db.raw('COUNT(*) as refund_count'),
      db.raw('COALESCE(SUM(total_refund_egp), 0) as refund_total_egp'),
    )
    .first() as Record<string, string>;

  const voidsAgg = await db('invoices')
    .where('status', 'cancelled')
    .whereBetween('created_at', [startIso, endIso])
    .select(
      db.raw('COUNT(*) as void_count'),
      db.raw('COALESCE(SUM(total_egp), 0) as void_total_egp'),
    )
    .first() as Record<string, string>;

  // Line discounts sum (from invoice_lines)
  const linePriceAgg = await db('invoice_lines as il')
    .join('invoices as i', 'il.invoice_id', 'i.id')
    .whereIn('i.status', SALE_REALIZED_STATUSES as unknown as string[])
    .whereBetween('i.created_at', [startIso, endIso])
    .select(db.raw('COALESCE(SUM(il.line_discount_egp), 0) as total_line_discount'))
    .first() as Record<string, string>;

  const salesSummary: DailySalesSummary = {
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
    .whereIn('i.status', SALE_REALIZED_STATUSES as unknown as string[])
    .whereBetween('i.created_at', [startIso, endIso])
    .where((qb) => {
      qb.where(db.raw('i.cart_discount_egp + i.final_discount_egp'), '>', 0).orWhere(
        db.raw('COALESCE(ld.line_discounts_egp, 0)'),
        '>',
        0,
      );
    })
    .select(
      'i.invoice_no',
      db.raw('i.cart_discount_egp + i.final_discount_egp as cart_discount_egp'),
      db.raw('COALESCE(ld.line_discounts_egp, 0) as line_discounts_egp'),
      db.raw(
        'i.cart_discount_egp + i.final_discount_egp + COALESCE(ld.line_discounts_egp, 0) as total_discount_egp',
      ),
    );

  const discounts: DailyDiscountLine[] = discountRows.map((r: Record<string, unknown>) => ({
    invoice_no: String(r['invoice_no']),
    cart_discount_egp: fmtEgp(r['cart_discount_egp'] as string),
    line_discounts_egp: fmtEgp(r['line_discounts_egp'] as string),
    total_discount_egp: fmtEgp(r['total_discount_egp'] as string),
  }));

  // ─── 3. Refunds + Voids ──────────────────────────────────────────────────────
  const refundRows = await db('returns as r')
    .join('invoices as i', 'r.original_invoice_id', 'i.id')
    .whereBetween('r.processed_at', [startIso, endIso])
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
    .whereBetween('created_at', [startIso, endIso])
    .select('invoice_no', 'id as invoice_id', 'total_egp as amount_egp', 'created_at', 'notes_ar');

  const refundsVoids: DailyRefundVoidLine[] = [
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
    .whereBetween('created_at', [startIso, endIso])
    .orderBy('created_at', 'asc')
    .select('direction', 'event_type', 'amount_egp', 'notes_ar', 'created_at');

  const drawerRow = await db('cash_drawer').first();
  const openingBal = Number(drawerRow?.balance_egp ?? 0);

  // Compute balance just before shift start (all movements before startIso)
  const preShiftAgg = await db('cash_movements')
    .where('created_at', '<', startIso)
    .select(
      db.raw("COALESCE(SUM(CASE WHEN direction='in' THEN amount_egp ELSE -amount_egp END), 0) as net"),
    )
    .first() as { net: string } | undefined;

  // Opening balance is the initial balance + all pre-shift movements
  const initOpeningBal = Number(drawerRow?.opening_balance_egp ?? 0);
  const preShiftNet = Number(preShiftAgg?.net ?? 0);
  const shiftOpeningBalance = initOpeningBal + preShiftNet;

  const totalIn = cashMvts
    .filter((m: Record<string, unknown>) => m['direction'] === 'in')
    .reduce((s: number, m: Record<string, unknown>) => s + Number(m['amount_egp']), 0);
  const totalOut = cashMvts
    .filter((m: Record<string, unknown>) => m['direction'] === 'out')
    .reduce((s: number, m: Record<string, unknown>) => s + Number(m['amount_egp']), 0);

  const cash: DailyCashSummary = {
    opening_balance_egp: fmtEgp(shiftOpeningBalance),
    total_in_egp: fmtEgp(totalIn),
    total_out_egp: fmtEgp(totalOut),
    closing_balance_egp: fmtEgp(shiftOpeningBalance + totalIn - totalOut),
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
    .whereBetween('bm.created_at', [startIso, endIso])
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

  const bankMovements: DailyBankMovement[] = bankMvts.map((m: Record<string, unknown>) => ({
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
    .whereIn('i.status', SALE_REALIZED_STATUSES as unknown as string[])
    .whereBetween('i.created_at', [startIso, endIso])
    .select(
      'f.name_ar as fabric_name_ar',
      'c.name_ar as color_name_ar',
      'r.roll_sr_no',
      'r.weight_kg',
      'il.line_total_egp as revenue_egp',
    )
    .orderBy(['f.name_ar', 'c.name_ar']);

  const salesByFabric: DailySalesByFabricRow[] = fabricRows.map((r: Record<string, unknown>) => ({
    fabric_name_ar: String(r['fabric_name_ar']),
    color_name_ar: String(r['color_name_ar']),
    roll_sr_no: r['roll_sr_no'] as string | null,
    weight_kg: Number(r['weight_kg'] ?? 0).toFixed(3),
    revenue_egp: fmtEgp(r['revenue_egp'] as string),
  }));

  // ─── 7. Open invoices summary ────────────────────────────────────────────────
  const openedToday = await db('invoices')
    .whereIn('status', ['open', 'closed_pending_pickup', 'completed', 'partially_returned', 'returned'])
    .whereBetween('created_at', [startIso, endIso])
    .select(
      db.raw('COUNT(*) as opened_today_count'),
      db.raw('COALESCE(SUM(total_egp), 0) as opened_today_value_egp'),
    )
    .first() as Record<string, string>;

  const closedToday = await db('invoices')
    .whereIn('status', ['completed', 'closed_pending_pickup', 'partially_returned', 'returned'])
    .whereBetween('closed_at', [startIso, endIso])
    .select(
      db.raw('COUNT(*) as closed_today_count'),
      db.raw('COALESCE(SUM(total_egp), 0) as closed_today_value_egp'),
    )
    .first() as Record<string, string>;

  const openInvoicesSummary: DailyOpenInvoicesSummary = {
    opened_today_count: Number(openedToday?.opened_today_count ?? 0),
    opened_today_value_egp: fmtEgp(openedToday?.opened_today_value_egp),
    closed_today_count: Number(closedToday?.closed_today_count ?? 0),
    closed_today_value_egp: fmtEgp(closedToday?.closed_today_value_egp),
  };

  // ─── 8. Stock movements ──────────────────────────────────────────────────────
  const smRows = await db('stock_movements')
    .whereBetween('created_at', [startIso, endIso])
    .groupBy('event_type')
    .select('event_type', db.raw('COUNT(*) as count'));

  const stockMovements: DailyStockMovement[] = smRows.map((r: Record<string, unknown>) => ({
    event_type: String(r['event_type']),
    count: Number(r['count']),
  }));

  return {
    date: targetDate,
    shift_start_cairo: formatCairo(startUtc),
    shift_end_cairo: formatCairo(endUtc),
    generated_at: formatCairo(new Date()),
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

/** Convert a DailyReport into the generic ReportPdfOptions format for export. */
export function dailyReportToExportSections(report: DailyReport) {
  const { sales_summary: ss, discounts, refunds_voids: rv, cash, sales_by_fabric, open_invoices_summary: ois, stock_movements } = report;

  return {
    titleAr: 'التقرير اليومي',
    subtitleAr: `يوم: ${report.date} | من ${report.shift_start_cairo} إلى ${report.shift_end_cairo}`,
    generatedAt: report.generated_at,
    sections: [
      {
        titleAr: '1. ملخص المبيعات',
        columns: [
          { label: 'البيان', key: 'label', width: '*' },
          { label: 'القيمة (ج.م)', key: 'value', width: 'auto' },
        ],
        rows: [
          { label: 'عدد الفواتير المكتملة', value: String(ss.invoice_count) },
          { label: 'إجمالي المبيعات (قبل الخصم)', value: ss.gross_subtotal_egp },
          { label: 'إجمالي الخصم على الفاتورة', value: ss.total_cart_discount_egp },
          { label: 'الصافي', value: ss.total_net_egp },
          { label: 'عدد المرتجعات', value: String(ss.refund_count) },
          { label: 'إجمالي المرتجعات', value: ss.refund_total_egp },
          { label: 'عدد الملغيات', value: String(ss.void_count) },
          { label: 'إجمالي الملغيات', value: ss.void_total_egp },
        ],
      },
      {
        titleAr: '2. الخصومات',
        columns: [
          { label: 'رقم الفاتورة', key: 'invoice_no', width: 'auto' },
          { label: 'خصم الفاتورة', key: 'cart_discount_egp', width: 'auto' },
          { label: 'خصم الأصناف', key: 'line_discounts_egp', width: 'auto' },
          { label: 'الإجمالي', key: 'total_discount_egp', width: 'auto', bold: true },
        ],
        rows: discounts,
        emptyAr: 'لا توجد خصومات اليوم',
      },
      {
        titleAr: '3. المرتجعات والملغيات',
        columns: [
          { label: 'النوع', key: 'type_ar', width: 'auto' },
          { label: 'رقم الفاتورة', key: 'invoice_no', width: 'auto' },
          { label: 'المبلغ (ج.م)', key: 'amount_egp', width: 'auto' },
          { label: 'الوقت', key: 'created_at', width: '*' },
          { label: 'ملاحظات', key: 'notes_ar', width: '*' },
        ],
        rows: rv.map((r) => ({ ...r, type_ar: r.type === 'refund' ? 'مرتجع' : 'ملغي', notes_ar: r.notes_ar ?? '' })),
        emptyAr: 'لا توجد مرتجعات أو ملغيات اليوم',
      },
      {
        titleAr: '4. حركات الخزنة الكاش',
        columns: [
          { label: 'الاتجاه', key: 'dir_ar', width: 'auto' },
          { label: 'النوع', key: 'event_type', width: '*' },
          { label: 'المبلغ (ج.م)', key: 'amount_egp', width: 'auto' },
          { label: 'الوقت', key: 'created_at', width: 'auto' },
          { label: 'ملاحظات', key: 'notes_ar', width: '*' },
        ],
        rows: cash.movements.map((m) => ({ ...m, dir_ar: m.direction === 'in' ? '↑ داخل' : '↓ خارج', notes_ar: m.notes_ar ?? '' })),
        totals: { dir_ar: 'الرصيد الختامي', amount_egp: cash.closing_balance_egp },
        emptyAr: 'لا توجد حركات كاش اليوم',
      },
      {
        titleAr: '5. المبيعات حسب الخامة واللون',
        columns: [
          { label: 'الخامة', key: 'fabric_name_ar', width: '*' },
          { label: 'اللون', key: 'color_name_ar', width: 'auto' },
          { label: 'رقم التوب', key: 'roll_sr_no', width: 'auto' },
          { label: 'الوزن (كجم)', key: 'weight_kg', width: 'auto' },
          { label: 'الإيراد (ج.م)', key: 'revenue_egp', width: 'auto' },
        ],
        rows: sales_by_fabric.map((r) => ({ ...r, roll_sr_no: r.roll_sr_no ?? '' })),
        emptyAr: 'لا توجد مبيعات اليوم',
      },
      {
        titleAr: '6. الفواتير المفتوحة',
        columns: [
          { label: 'البيان', key: 'label', width: '*' },
          { label: 'العدد', key: 'count', width: 'auto' },
          { label: 'القيمة (ج.م)', key: 'value', width: 'auto' },
        ],
        rows: [
          { label: 'فواتير مفتوحة اليوم', count: String(ois.opened_today_count), value: ois.opened_today_value_egp },
          { label: 'فواتير أُغلقت اليوم', count: String(ois.closed_today_count), value: ois.closed_today_value_egp },
        ],
      },
      {
        titleAr: '7. حركات المخزون',
        columns: [
          { label: 'نوع الحركة', key: 'event_type', width: '*' },
          { label: 'العدد', key: 'count', width: 'auto' },
        ],
        rows: stock_movements.map((m) => ({ event_type: m.event_type, count: String(m.count) })),
        emptyAr: 'لا توجد حركات مخزون اليوم',
      },
    ],
  };
}

