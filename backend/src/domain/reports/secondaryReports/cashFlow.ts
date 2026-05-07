import { db } from '../../../db/connection.js';
import { formatCairo } from '../../../lib/datetime/cairo.js';
import type { ReportPdfOptions } from '../../../lib/reports/pdfExport.js';

export type CashFlowRow = {
  created_at: string;
  direction: string;
  event_type: string;
  amount_egp: string;
  notes_ar: string | null;
  running_balance_egp: string;
};

export type CashFlowResult = {
  opening_balance_egp: string;
  closing_balance_egp: string;
  total_in_egp: string;
  total_out_egp: string;
  rows: CashFlowRow[];
};

export async function getCashFlow(from: string, to: string): Promise<CashFlowResult> {
  // Balance before the period
  const preAgg = await db('cash_movements')
    .where('created_at', '<', from)
    .select(
      db.raw(
        "COALESCE(SUM(CASE WHEN direction='in' THEN amount_egp ELSE -amount_egp END), 0) as net",
      ),
    )
    .first() as { net: string } | undefined;

  const drawerRow = await db('cash_drawer').first() as Record<string, unknown> | undefined;
  const initBal = Number(drawerRow?.['opening_balance_egp'] ?? 0);
  const preNet = Number(preAgg?.net ?? 0);
  let running = initBal + preNet;
  const openingBal = running;

  const rows = await db('cash_movements')
    .whereBetween('created_at', [from, to])
    .orderBy('created_at', 'asc')
    .select('created_at', 'direction', 'event_type', 'amount_egp', 'notes_ar');

  let totalIn = 0;
  let totalOut = 0;

  const mapped: CashFlowRow[] = rows.map((r: Record<string, unknown>) => {
    const amt = Number(r['amount_egp']);
    if (r['direction'] === 'in') { running += amt; totalIn += amt; }
    else { running -= amt; totalOut += amt; }
    return {
      created_at: formatCairo(String(r['created_at'])),
      direction: r['direction'] === 'in' ? '↑ داخل' : '↓ خارج',
      event_type: String(r['event_type']),
      amount_egp: amt.toFixed(2),
      notes_ar: r['notes_ar'] as string | null,
      running_balance_egp: running.toFixed(2),
    };
  });

  return {
    opening_balance_egp: openingBal.toFixed(2),
    closing_balance_egp: running.toFixed(2),
    total_in_egp: totalIn.toFixed(2),
    total_out_egp: totalOut.toFixed(2),
    rows: mapped,
  };
}

export function cashFlowToExport(
  result: CashFlowResult,
  from: string,
  to: string,
  generatedAt: string,
): ReportPdfOptions {
  return {
    titleAr: 'التدفق النقدي',
    subtitleAr: `من ${from} إلى ${to}`,
    generatedAt,
    sections: [
      {
        titleAr: 'ملخص',
        columns: [
          { label: 'البيان', key: 'label', width: '*' },
          { label: 'المبلغ (ج.م)', key: 'value', width: 'auto' },
        ],
        rows: [
          { label: 'الرصيد الافتتاحي', value: result.opening_balance_egp },
          { label: 'إجمالي الداخل', value: result.total_in_egp },
          { label: 'إجمالي الخارج', value: result.total_out_egp },
          { label: 'الرصيد الختامي', value: result.closing_balance_egp },
        ],
      },
      {
        titleAr: 'تفاصيل الحركات',
        columns: [
          { label: 'التاريخ', key: 'created_at', width: 'auto' },
          { label: 'الاتجاه', key: 'direction', width: 'auto' },
          { label: 'النوع', key: 'event_type', width: 'auto' },
          { label: 'المبلغ (ج.م)', key: 'amount_egp', width: 'auto' },
          { label: 'الرصيد المتراكم', key: 'running_balance_egp', width: 'auto', bold: true },
          { label: 'ملاحظات', key: 'notes_ar', width: '*' },
        ],
        rows: result.rows.map((r) => ({ ...r, notes_ar: r.notes_ar ?? '' })),
        emptyAr: 'لا توجد حركات في هذه الفترة',
      },
    ],
  };
}
