import { db } from '../../../db/connection.js';
import { formatCairo } from '../../../lib/datetime/cairo.js';
import type { ReportPdfOptions } from '../../../lib/reports/pdfExport.js';

export type OutstandingChequesRow = {
  payment_id: number;
  invoice_no: string;
  customer_name_ar: string;
  customer_phone: string;
  payment_kind: string;
  amount_egp: string;
  created_at: string;
};

export type OutstandingChequesResult = {
  rows: OutstandingChequesRow[];
  total_egp: string;
  count: number;
};

const KIND_LABELS: Record<string, string> = {
  deposit: 'عربون',
  final: 'دفعة نهائية',
  refund: 'استرداد',
};

export async function getOutstandingCheques(from: string, to: string): Promise<OutstandingChequesResult> {
  const rows = await db('payments as p')
    .join('invoices as i', 'p.invoice_id', 'i.id')
    .join('customers as c', 'i.customer_id', 'c.id')
    .where('p.method', 'cheque')
    .whereBetween('p.created_at', [from, to])
    .orderBy('p.created_at', 'desc')
    .select(
      'p.id as payment_id',
      'i.invoice_no',
      'c.name_ar as customer_name_ar',
      'c.phone as customer_phone',
      'p.payment_kind',
      'p.amount_egp',
      'p.created_at',
    );

  const totalEgp = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r['amount_egp']), 0);

  return {
    rows: rows.map((r: Record<string, unknown>) => ({
      payment_id: Number(r['payment_id']),
      invoice_no: String(r['invoice_no']),
      customer_name_ar: String(r['customer_name_ar']),
      customer_phone: String(r['customer_phone']),
      payment_kind: KIND_LABELS[String(r['payment_kind'])] ?? String(r['payment_kind']),
      amount_egp: Number(r['amount_egp']).toFixed(2),
      created_at: formatCairo(new Date(String(r['created_at']))),
    })),
    total_egp: totalEgp.toFixed(2),
    count: rows.length,
  };
}

export function outstandingChequesToExport(
  data: OutstandingChequesResult,
  from: string,
  to: string,
  generatedAt: string,
): ReportPdfOptions {
  return {
    titleAr: 'الشيكات المسجّلة',
    subtitleAr: `من ${from} إلى ${to}`,
    generatedAt,
    sections: [
      {
        titleAr: 'الشيكات',
        columns: [
          { label: 'رقم الفاتورة', key: 'invoice_no', width: 'auto' },
          { label: 'العميل', key: 'customer_name_ar', width: '*' },
          { label: 'الهاتف', key: 'customer_phone', width: 'auto' },
          { label: 'نوع الدفع', key: 'payment_kind', width: 'auto' },
          { label: 'المبلغ (ج.م)', key: 'amount_egp', width: 'auto' },
          { label: 'التاريخ', key: 'created_at', width: 'auto' },
        ],
        rows: data.rows.map((r) => ({ ...r, payment_id: String(r.payment_id) })),
        totals: { invoice_no: 'الإجمالي', amount_egp: data.total_egp },
        emptyAr: 'لا توجد شيكات في هذه الفترة',
      },
    ],
  };
}
