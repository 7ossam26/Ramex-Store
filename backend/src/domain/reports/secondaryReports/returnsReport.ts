import { db } from '../../../db/connection.js';
import { formatCairo } from '../../../lib/datetime/cairo.js';
import type { ReportPdfOptions } from '../../../lib/reports/pdfExport.js';

export type ReturnsReportRow = {
  return_no: string;
  kind: string;
  invoice_no: string;
  customer_name_ar: string;
  customer_phone: string;
  refund_method: string;
  total_refund_egp: string;
  processed_at: string;
  notes_ar: string | null;
};

export type ReturnsReportResult = {
  rows: ReturnsReportRow[];
  total_refund_egp: string;
  by_method: { refund_method: string; count: number; total_egp: string }[];
};

export async function getReturnsReport(from: string, to: string): Promise<ReturnsReportResult> {
  const rows = await db('returns as ret')
    .join('invoices as i', 'ret.original_invoice_id', 'i.id')
    .join('customers as c', 'ret.customer_id', 'c.id')
    .whereBetween('ret.processed_at', [from, to])
    .orderBy('ret.processed_at', 'desc')
    .select(
      'ret.return_no',
      'ret.kind',
      'i.invoice_no',
      'c.name_ar as customer_name_ar',
      'c.phone as customer_phone',
      'ret.refund_method',
      'ret.total_refund_egp',
      'ret.processed_at',
      'ret.notes_ar',
    );

  const byMethod = await db('returns')
    .whereBetween('processed_at', [from, to])
    .groupBy('refund_method')
    .select(
      'refund_method',
      db.raw('COUNT(*) as count'),
      db.raw('COALESCE(SUM(total_refund_egp), 0) as total_egp'),
    );

  const grandTotal = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r['total_refund_egp']), 0);

  return {
    rows: rows.map((r: Record<string, unknown>) => ({
      return_no: String(r['return_no']),
      kind: String(r['kind']),
      invoice_no: String(r['invoice_no']),
      customer_name_ar: String(r['customer_name_ar']),
      customer_phone: String(r['customer_phone']),
      refund_method: String(r['refund_method']),
      total_refund_egp: Number(r['total_refund_egp']).toFixed(2),
      processed_at: formatCairo(new Date(String(r['processed_at']))),
      notes_ar: r['notes_ar'] ? String(r['notes_ar']) : null,
    })),
    total_refund_egp: grandTotal.toFixed(2),
    by_method: byMethod.map((r: Record<string, unknown>) => ({
      refund_method: String(r['refund_method']),
      count: Number(r['count']),
      total_egp: Number(r['total_egp']).toFixed(2),
    })),
  };
}

export function returnsReportToExport(
  data: ReturnsReportResult,
  from: string,
  to: string,
  generatedAt: string,
): ReportPdfOptions {
  return {
    titleAr: 'تقرير المرتجعات',
    subtitleAr: `من ${from} إلى ${to}`,
    generatedAt,
    sections: [
      {
        titleAr: 'عمليات الإرجاع',
        columns: [
          { label: 'رقم الإرجاع', key: 'return_no', width: 'auto' },
          { label: 'النوع', key: 'kind', width: 'auto' },
          { label: 'الفاتورة', key: 'invoice_no', width: 'auto' },
          { label: 'العميل', key: 'customer_name_ar', width: '*' },
          { label: 'طريقة الاسترداد', key: 'refund_method', width: 'auto' },
          { label: 'المبلغ (ج.م)', key: 'total_refund_egp', width: 'auto' },
          { label: 'التاريخ', key: 'processed_at', width: 'auto' },
        ],
        rows: data.rows.map((r) => ({ ...r, notes_ar: r.notes_ar ?? '' })),
        totals: { return_no: 'الإجمالي', total_refund_egp: data.total_refund_egp },
        emptyAr: 'لا توجد مرتجعات في هذه الفترة',
      },
    ],
  };
}
