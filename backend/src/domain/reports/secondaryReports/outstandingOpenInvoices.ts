import { db } from '../../../db/connection.js';
import { formatCairo } from '../../../lib/datetime/cairo.js';
import type { ReportPdfOptions } from '../../../lib/reports/pdfExport.js';

export type OutstandingInvoiceRow = {
  invoice_no: string;
  invoice_id: number;
  created_at: string;
  age_days: number;
  customer_name_ar: string;
  customer_phone: string;
  total_egp: string;
  deposit_paid_egp: string;
  balance_egp: string;
  is_stale: boolean;
};

export async function getOutstandingOpenInvoices(): Promise<OutstandingInvoiceRow[]> {
  const now = new Date();

  const rows = await db('invoices as i')
    .join('customers as c', 'i.customer_id', 'c.id')
    .where('i.status', 'open')
    .orderBy('i.created_at', 'asc')
    .select(
      'i.id as invoice_id',
      'i.invoice_no',
      'i.created_at',
      'i.total_egp',
      'i.paid_egp as deposit_paid_egp',
      'i.balance_egp',
      'i.is_stale',
      'c.name_ar as customer_name_ar',
      'c.phone as customer_phone',
    );

  return rows.map((r: Record<string, unknown>) => {
    const createdAt = new Date(String(r['created_at']));
    const ageDays = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    return {
      invoice_no: String(r['invoice_no']),
      invoice_id: Number(r['invoice_id']),
      created_at: formatCairo(String(r['created_at'])),
      age_days: ageDays,
      customer_name_ar: String(r['customer_name_ar']),
      customer_phone: String(r['customer_phone']),
      total_egp: Number(r['total_egp']).toFixed(2),
      deposit_paid_egp: Number(r['deposit_paid_egp']).toFixed(2),
      balance_egp: Number(r['balance_egp']).toFixed(2),
      is_stale: Boolean(r['is_stale']),
    };
  });
}

export function outstandingOpenInvoicesToExport(
  rows: OutstandingInvoiceRow[],
  generatedAt: string,
): ReportPdfOptions {
  const totBalance = rows.reduce((s, r) => s + Number(r.balance_egp), 0);
  const totDeposit = rows.reduce((s, r) => s + Number(r.deposit_paid_egp), 0);

  return {
    titleAr: 'الفواتير المفتوحة المتبقية',
    generatedAt,
    sections: [
      {
        titleAr: 'الفواتير المفتوحة',
        columns: [
          { label: 'رقم الفاتورة', key: 'invoice_no', width: 'auto' },
          { label: 'العميل', key: 'customer_name_ar', width: '*' },
          { label: 'الهاتف', key: 'customer_phone', width: 'auto' },
          { label: 'تاريخ الفتح', key: 'created_at', width: 'auto' },
          { label: 'العمر (يوم)', key: 'age_days', width: 'auto' },
          { label: 'الإجمالي (ج.م)', key: 'total_egp', width: 'auto' },
          { label: 'العربون المدفوع', key: 'deposit_paid_egp', width: 'auto' },
          { label: 'الباقي (ج.م)', key: 'balance_egp', width: 'auto', bold: true },
          { label: 'متأخرة؟', key: 'stale_ar', width: 'auto' },
        ],
        rows: rows.map((r) => ({
          invoice_no: r.invoice_no,
          invoice_id: r.invoice_id,
          customer_name_ar: r.customer_name_ar,
          customer_phone: r.customer_phone,
          created_at: r.created_at,
          age_days: String(r.age_days),
          total_egp: r.total_egp,
          deposit_paid_egp: r.deposit_paid_egp,
          balance_egp: r.balance_egp,
          stale_ar: r.is_stale ? 'نعم' : '',
        })),
        totals: {
          invoice_no: 'الإجمالي',
          deposit_paid_egp: totDeposit.toFixed(2),
          balance_egp: totBalance.toFixed(2),
        },
        emptyAr: 'لا توجد فواتير مفتوحة حالياً',
      },
    ],
  };
}
