import { db } from '../../db/connection.js';
import { fromZonedTime } from 'date-fns-tz';
import { formatCairo } from '../../lib/datetime/cairo.js';
import type { ReportPdfOptions } from '../../lib/reports/pdfExport.js';

export type SalesExportRow = {
  invoice_no: string;
  customer_name_ar: string;
  cashier_name: string;
  created_at_formatted: string;
  status_ar: string;
  total_egp: string;
  paid_egp: string;
  balance_egp: string;
};

const STATUS_AR: Record<string, string> = {
  open: 'مفتوح',
  closed_pending_pickup: 'بانتظار الاستلام',
  completed: 'مكتمل',
  cancelled: 'ملغي',
  deposit_refunded: 'مُسترد',
  returned: 'مرتجعة',
  partially_returned: 'مرتجعة جزئياً',
};

const CAIRO_TZ = 'Africa/Cairo';

export async function getSalesExport(params: {
  from: string;
  to: string;
  status?: string;
}): Promise<SalesExportRow[]> {
  // Treat the from/to strings as Cairo local time and convert to UTC for the DB query
  const fromUtc = fromZonedTime(new Date(params.from), CAIRO_TZ).toISOString();
  const toUtc   = fromZonedTime(new Date(params.to),   CAIRO_TZ).toISOString();

  let q = db('invoices as i')
    .join('customers as c', 'i.customer_id', 'c.id')
    .join('users as u', 'i.cashier_user_id', 'u.id')
    .whereBetween('i.created_at', [fromUtc, toUtc])
    .orderBy('i.created_at', 'asc')
    .select(
      'i.invoice_no',
      'c.name_ar as customer_name_ar',
      'u.full_name_ar as cashier_name',
      'i.created_at',
      'i.status',
      'i.total_egp',
      'i.paid_egp',
      'i.balance_egp',
    );

  if (params.status && params.status !== 'all') {
    q = q.where('i.status', params.status);
  }

  const rows = await q;

  return rows.map((r: Record<string, unknown>) => ({
    invoice_no: String(r['invoice_no']),
    customer_name_ar: String(r['customer_name_ar']),
    cashier_name: String(r['cashier_name']),
    created_at_formatted: formatCairo(new Date(String(r['created_at']))),
    status_ar: STATUS_AR[String(r['status'])] ?? String(r['status']),
    total_egp: Number(r['total_egp']).toFixed(2),
    paid_egp: Number(r['paid_egp']).toFixed(2),
    balance_egp: Number(r['balance_egp']).toFixed(2),
  }));
}

export function salesToExport(
  rows: SalesExportRow[],
  from: string,
  to: string,
  generatedAt: string,
): ReportPdfOptions {
  const totalEgp = rows.reduce((s, r) => s + Number(r.total_egp), 0);
  const paidEgp = rows.reduce((s, r) => s + Number(r.paid_egp), 0);
  const balanceEgp = rows.reduce((s, r) => s + Number(r.balance_egp), 0);

  return {
    titleAr: 'تقرير المبيعات',
    subtitleAr: `من ${from} إلى ${to}`,
    generatedAt,
    sections: [
      {
        titleAr: 'قائمة الفواتير',
        columns: [
          { label: 'رقم الفاتورة', key: 'invoice_no', width: 14 },
          { label: 'العميل', key: 'customer_name_ar', width: 22 },
          { label: 'الكاشير', key: 'cashier_name', width: 18 },
          { label: 'التاريخ والوقت', key: 'created_at_formatted', width: 18 },
          { label: 'الحالة', key: 'status_ar', width: 16 },
          { label: 'الإجمالي (ج.م)', key: 'total_egp', width: 16 },
          { label: 'المدفوع (ج.م)', key: 'paid_egp', width: 16 },
          { label: 'الرصيد (ج.م)', key: 'balance_egp', width: 16 },
        ],
        rows: rows as unknown as Record<string, unknown>[],
        totals: {
          invoice_no: 'الإجمالي',
          total_egp: totalEgp.toFixed(2),
          paid_egp: paidEgp.toFixed(2),
          balance_egp: balanceEgp.toFixed(2),
        },
        emptyAr: 'لا توجد فواتير في هذه الفترة',
      },
    ],
  };
}
