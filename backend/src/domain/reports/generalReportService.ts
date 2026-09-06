import { db } from '../../db/connection.js';
import { cairoDayWindow, formatCairo } from '../../lib/datetime/cairo.js';
import { toZonedTime } from 'date-fns-tz';
import type { ReportPdfOptions } from '../../lib/reports/pdfExport.js';
import { SALE_REALIZED_STATUSES } from '../sales/sales.types.js';

const CAIRO_TZ = 'Africa/Cairo';

function fmtEgp(n: number | string | null | undefined): string {
  return Number(n ?? 0).toFixed(2);
}

export type GeneralReportSummary = {
  total_sales_egp: string;
  invoice_count: number;
};

export type HourlySale = {
  hour: string;
  total_egp: number;
};

export type SalesByFabricSlice = {
  name: string;
  value: number;
};

export type StoreRow = {
  store_name_ar: string;
  total_sales_egp: string;
  invoice_count: number;
  avg_invoice_egp: string;
};

export type GeneralReport = {
  from: string;
  to: string;
  generated_at: string;
  summary: GeneralReportSummary;
  hourly_sales: HourlySale[];
  sales_by_fabric: SalesByFabricSlice[];
  store_rows: StoreRow[];
};

export async function getGeneralReport(fromDate: string, toDate: string): Promise<GeneralReport> {
  const { startUtc } = cairoDayWindow(fromDate);
  const { endUtc } = cairoDayWindow(toDate);
  const startIso = startUtc.toISOString();
  const endIso = endUtc.toISOString();

  // ── 1. Summary ────────────────────────────────────────────────────────────────
  const salesAgg = await db('invoices')
    .whereIn('status', SALE_REALIZED_STATUSES as unknown as string[])
    .whereBetween('created_at', [startIso, endIso])
    .select(
      db.raw('COUNT(*) as invoice_count'),
      db.raw('COALESCE(SUM(total_egp), 0) as total_sales_egp'),
    )
    .first() as Record<string, string>;

  const totalSales = Number(salesAgg?.total_sales_egp ?? 0);
  const invoiceCount = Number(salesAgg?.invoice_count ?? 0);

  const summary: GeneralReportSummary = {
    total_sales_egp: fmtEgp(totalSales),
    invoice_count: invoiceCount,
  };

  // ── 3. Hourly sales (group by Cairo hour in JS) ────────────────────────────────
  const invoiceRows = await db('invoices')
    .whereIn('status', SALE_REALIZED_STATUSES as unknown as string[])
    .whereBetween('created_at', [startIso, endIso])
    .select('created_at', 'total_egp');

  const hourlyMap = new Map<number, number>();
  for (const row of invoiceRows as Record<string, unknown>[]) {
    const cairoTime = toZonedTime(new Date(String(row['created_at'])), CAIRO_TZ);
    const h = cairoTime.getHours();
    hourlyMap.set(h, (hourlyMap.get(h) ?? 0) + Number(row['total_egp']));
  }

  const hourlySales: HourlySale[] = Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, '0')}:00`,
    total_egp: hourlyMap.get(h) ?? 0,
  }));

  // ── 4. Sales by fabric ────────────────────────────────────────────────────────
  const fabricRows = await db('invoice_lines as il')
    .join('invoices as i', 'il.invoice_id', 'i.id')
    .join('rolls as r', 'il.roll_id', 'r.id')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .whereIn('i.status', SALE_REALIZED_STATUSES as unknown as string[])
    .whereBetween('i.created_at', [startIso, endIso])
    .groupBy('f.id', 'f.name_ar')
    .orderBy('total_egp', 'desc')
    .select(
      'f.name_ar as fabric_name_ar',
      db.raw('COALESCE(SUM(il.line_total_egp), 0) as total_egp'),
    );

  const salesByFabric: SalesByFabricSlice[] = (fabricRows as Record<string, unknown>[]).map((r) => ({
    name: String(r['fabric_name_ar']),
    value: Number(r['total_egp']),
  }));

  // ── 5. Store summary row ──────────────────────────────────────────────────────
  const settingRow = await db('settings').where('key', 'store_name_ar').first() as
    | { value_json: unknown }
    | undefined;
  const storeNameAr = settingRow
    ? String(settingRow.value_json).replace(/^"|"$/g, '')
    : 'الفرع الرئيسي';

  const storeRows: StoreRow[] = [
    {
      store_name_ar: storeNameAr,
      total_sales_egp: fmtEgp(totalSales),
      invoice_count: invoiceCount,
      avg_invoice_egp: fmtEgp(invoiceCount > 0 ? totalSales / invoiceCount : 0),
    },
  ];

  return {
    from: fromDate,
    to: toDate,
    generated_at: formatCairo(new Date()),
    summary,
    hourly_sales: hourlySales,
    sales_by_fabric: salesByFabric,
    store_rows: storeRows,
  };
}

export function generalReportToExportSections(report: GeneralReport): ReportPdfOptions {
  const { summary, store_rows, sales_by_fabric } = report;

  return {
    titleAr: 'التقرير العام',
    subtitleAr: `من ${report.from} إلى ${report.to}`,
    generatedAt: report.generated_at,
    sections: [
      {
        titleAr: 'ملخص الأداء',
        columns: [
          { label: 'البيان', key: 'label', width: '*' },
          { label: 'القيمة', key: 'value', width: 'auto' },
        ],
        rows: [
          { label: 'إجمالي المبيعات (ج.م)', value: summary.total_sales_egp },
          { label: 'عدد الفواتير', value: String(summary.invoice_count) },
        ],
      },
      {
        titleAr: 'تفاصيل المبيعات',
        columns: [
          { label: 'الفرع', key: 'store_name_ar', width: '*' },
          { label: 'المبيعات (ج.م)', key: 'total_sales_egp', width: 'auto' },
          { label: 'عدد الفواتير', key: 'invoice_count', width: 'auto' },
          { label: 'متوسط الفاتورة (ج.م)', key: 'avg_invoice_egp', width: 'auto' },
        ],
        rows: store_rows.map((r) => ({ ...r, invoice_count: String(r.invoice_count) })),
        emptyAr: 'لا توجد مبيعات',
      },
      {
        titleAr: 'توزيع المبيعات حسب الخامة',
        columns: [
          { label: 'الخامة', key: 'name', width: '*' },
          { label: 'الإيراد (ج.م)', key: 'value', width: 'auto' },
        ],
        rows: sales_by_fabric.map((r) => ({ name: r.name, value: String(r.value.toFixed(2)) })),
        emptyAr: 'لا توجد بيانات',
      },
    ],
  };
}
