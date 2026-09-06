import { db } from '../../../db/connection.js';
import type { ReportPdfOptions } from '../../../lib/reports/pdfExport.js';

export type PaymentMethodRow = {
  method: string;
  payment_kind: string;
  count: number;
  total_egp: string;
};

export type SalesByPaymentMethodResult = {
  rows: PaymentMethodRow[];
  cash_total_egp: string;
  instapay_total_egp: string;
  deposit_total_egp: string;
  final_total_egp: string;
  grand_total_egp: string;
};

export async function getSalesByPaymentMethod(
  from: string,
  to: string,
): Promise<SalesByPaymentMethodResult> {
  const rows = await db('payments as p')
    .join('invoices as i', 'p.invoice_id', 'i.id')
    .whereIn('i.status', ['open', 'closed_pending_pickup', 'completed', 'partially_returned', 'returned'])
    .where('p.payment_kind', '!=', 'refund')
    .whereBetween('p.created_at', [from, to])
    .groupBy('p.method', 'p.payment_kind')
    .orderBy(['p.method', 'p.payment_kind'])
    .select(
      'p.method',
      'p.payment_kind',
      db.raw('COUNT(*) as count'),
      db.raw('COALESCE(SUM(p.amount_egp), 0) as total_egp'),
    );

  const mapped: PaymentMethodRow[] = rows.map((r: Record<string, unknown>) => ({
    method: String(r['method']),
    payment_kind: String(r['payment_kind']),
    count: Number(r['count']),
    total_egp: Number(r['total_egp']).toFixed(2),
  }));

  const cashTotal = mapped.filter((r) => r.method === 'cash').reduce((s, r) => s + Number(r.total_egp), 0);
  const instaTotal = mapped.filter((r) => r.method === 'instapay').reduce((s, r) => s + Number(r.total_egp), 0);
  const depositTotal = mapped.filter((r) => r.payment_kind === 'deposit').reduce((s, r) => s + Number(r.total_egp), 0);
  const finalTotal = mapped.filter((r) => r.payment_kind === 'final').reduce((s, r) => s + Number(r.total_egp), 0);
  const grandTotal = cashTotal + instaTotal;

  return {
    rows: mapped,
    cash_total_egp: cashTotal.toFixed(2),
    instapay_total_egp: instaTotal.toFixed(2),
    deposit_total_egp: depositTotal.toFixed(2),
    final_total_egp: finalTotal.toFixed(2),
    grand_total_egp: grandTotal.toFixed(2),
  };
}

export function salesByPaymentMethodToExport(
  result: SalesByPaymentMethodResult,
  from: string,
  to: string,
  generatedAt: string,
): ReportPdfOptions {
  return {
    titleAr: 'المبيعات حسب وسيلة الدفع',
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
          { label: 'إجمالي النقدي', value: result.cash_total_egp },
          { label: 'إجمالي انستاباي', value: result.instapay_total_egp },
          { label: 'إجمالي العربون', value: result.deposit_total_egp },
          { label: 'إجمالي الدفعات النهائية', value: result.final_total_egp },
          { label: 'الإجمالي الكلي', value: result.grand_total_egp },
        ],
      },
      {
        titleAr: 'تفاصيل حسب الوسيلة والنوع',
        columns: [
          { label: 'وسيلة الدفع', key: 'method', width: '*' },
          { label: 'نوع الدفع', key: 'payment_kind', width: 'auto' },
          { label: 'عدد العمليات', key: 'count', width: 'auto' },
          { label: 'الإجمالي (ج.م)', key: 'total_egp', width: 'auto', bold: true },
        ],
        rows: mapped_rows(result.rows),
        emptyAr: 'لا توجد مدفوعات في هذه الفترة',
      },
    ],
  };
}

function mapped_rows(rows: PaymentMethodRow[]) {
  return rows.map((r) => ({
    method: r.method === 'cash' ? 'نقدي' : 'انستاباي',
    payment_kind: r.payment_kind === 'deposit' ? 'عربون' : 'دفعة نهائية',
    count: String(r.count),
    total_egp: r.total_egp,
  }));
}
