import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/lib/reports-api';
import { ar } from '@/i18n/ar';
import { ReportShell, ReportTable, type DateRange } from './ReportShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Per-report column definitions for the rendered HTML table
type ColDef = { label: string; key: string };

type ReportConfig = {
  titleAr: string;
  columns: ColDef[];
  flatten?: (data: unknown) => Record<string, string | number>[];
  totals?: (data: unknown) => Record<string, string | number> | undefined;
  needsDateRange: boolean;
  needsCustomer?: boolean;
};

const fmt = (n: string | number) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const REPORT_CONFIGS: Record<string, ReportConfig> = {
  salesByFabricColor: {
    titleAr: ar.reports.salesByFabricColor,
    needsDateRange: true,
    columns: [
      { label: 'الخامة', key: 'fabric_name_ar' },
      { label: 'اللون', key: 'color_name_ar' },
      { label: 'عدد التوبات', key: 'roll_count' },
      { label: 'الوزن (كجم)', key: 'total_weight_kg' },
      { label: 'الإيراد (ج.م)', key: 'total_revenue_egp' },
      { label: 'متوسط السعر/كجم', key: 'avg_price_per_kg' },
    ],
    flatten: (d) => (d as Record<string, unknown>[]).map((r) => ({
      ...r as Record<string, string | number>,
      roll_count: String((r as Record<string, unknown>)['roll_count']),
      total_revenue_egp: fmt((r as Record<string, unknown>)['total_revenue_egp'] as string),
      avg_price_per_kg: fmt((r as Record<string, unknown>)['avg_price_per_kg'] as string),
    })),
  },
  outstandingOpenInvoices: {
    titleAr: ar.reports.outstandingOpenInvoices,
    needsDateRange: false,
    columns: [
      { label: 'رقم الفاتورة', key: 'invoice_no' },
      { label: 'العميل', key: 'customer_name_ar' },
      { label: 'الهاتف', key: 'customer_phone' },
      { label: 'تاريخ الفتح', key: 'created_at' },
      { label: 'العمر (يوم)', key: 'age_days' },
      { label: 'الإجمالي', key: 'total_egp' },
      { label: 'العربون', key: 'deposit_paid_egp' },
      { label: 'الباقي (ج.م)', key: 'balance_egp' },
      { label: 'متأخرة؟', key: 'stale_ar' },
    ],
    flatten: (d) => (d as Record<string, unknown>[]).map((r) => ({
      ...r as Record<string, string | number>,
      age_days: String((r as Record<string, unknown>)['age_days']),
      total_egp: fmt((r as Record<string, unknown>)['total_egp'] as string),
      deposit_paid_egp: fmt((r as Record<string, unknown>)['deposit_paid_egp'] as string),
      balance_egp: fmt((r as Record<string, unknown>)['balance_egp'] as string),
      stale_ar: (r as Record<string, unknown>)['is_stale'] ? 'نعم' : '',
    })),
  },
  stocktakeInventory: {
    titleAr: ar.reports.stocktakeInventory,
    needsDateRange: false,
    columns: [
      { label: 'المخزن', key: 'warehouse' },
      { label: 'الخامة', key: 'fabric_name_ar' },
      { label: 'اللون', key: 'color_name_ar' },
      { label: 'رقم التوب', key: 'roll_sr_no' },
      { label: 'الوزن (كجم)', key: 'weight_kg' },
      { label: 'الحالة', key: 'status' },
      { label: 'التقييم (ج.م)', key: 'valuation_egp' },
    ],
    flatten: (d) => {
      const summary = d as { rows: Record<string, unknown>[]; total_weight_kg: string; total_valuation_egp: string };
      return summary.rows.map((r) => ({
        ...r as Record<string, string | number>,
        roll_sr_no: String((r as Record<string, unknown>)['roll_sr_no'] ?? ''),
        valuation_egp: fmt((r as Record<string, unknown>)['valuation_egp'] as string),
      }));
    },
    totals: (d) => {
      const summary = d as { total_rolls: number; total_weight_kg: string; total_valuation_egp: string };
      return { warehouse: 'الإجمالي', weight_kg: summary.total_weight_kg, valuation_egp: fmt(summary.total_valuation_egp) };
    },
  },
  cashFlow: {
    titleAr: ar.reports.cashFlow,
    needsDateRange: true,
    columns: [
      { label: 'التاريخ', key: 'created_at' },
      { label: 'الاتجاه', key: 'direction' },
      { label: 'النوع', key: 'event_type' },
      { label: 'المبلغ (ج.م)', key: 'amount_egp' },
      { label: 'الرصيد المتراكم', key: 'running_balance_egp' },
      { label: 'ملاحظات', key: 'notes_ar' },
    ],
    flatten: (d) => {
      const res = d as { rows: Record<string, unknown>[] };
      return res.rows.map((r) => ({
        ...r as Record<string, string | number>,
        amount_egp: fmt((r as Record<string, unknown>)['amount_egp'] as string),
        running_balance_egp: fmt((r as Record<string, unknown>)['running_balance_egp'] as string),
        notes_ar: String((r as Record<string, unknown>)['notes_ar'] ?? ''),
      }));
    },
  },
  bankReconciliation: {
    titleAr: ar.reports.bankReconciliation,
    needsDateRange: true,
    columns: [
      { label: 'البنك', key: 'bank_name_ar' },
      { label: 'تاريخ التسوية', key: 'reconciled_at' },
      { label: 'الرصيد المتوقع', key: 'expected_balance_egp' },
      { label: 'الرصيد الفعلي', key: 'actual_balance_egp' },
      { label: 'الفرق (ج.م)', key: 'variance_egp' },
      { label: 'بواسطة', key: 'performed_by' },
    ],
    flatten: (d) => (d as Record<string, unknown>[]).map((r) => ({
      ...r as Record<string, string | number>,
      expected_balance_egp: fmt((r as Record<string, unknown>)['expected_balance_egp'] as string),
      actual_balance_egp: fmt((r as Record<string, unknown>)['actual_balance_egp'] as string),
      variance_egp: fmt((r as Record<string, unknown>)['variance_egp'] as string),
    })),
  },
  expenses: {
    titleAr: ar.reports.expenses,
    needsDateRange: true,
    columns: [
      { label: 'التاريخ', key: 'created_at' },
      { label: 'الفئة', key: 'category' },
      { label: 'المبلغ (ج.م)', key: 'amount_egp' },
      { label: 'المصدر', key: 'paid_from' },
      { label: 'الحالة', key: 'status' },
      { label: 'بواسطة', key: 'created_by' },
      { label: 'ملاحظات', key: 'notes_ar' },
    ],
    flatten: (d) => {
      const res = d as { rows: Record<string, unknown>[] };
      return res.rows.map((r) => ({
        ...r as Record<string, string | number>,
        amount_egp: fmt((r as Record<string, unknown>)['amount_egp'] as string),
        notes_ar: String((r as Record<string, unknown>)['notes_ar'] ?? ''),
      }));
    },
  },
  damageLoss: {
    titleAr: ar.reports.damageLoss,
    needsDateRange: true,
    columns: [
      { label: 'التاريخ', key: 'created_at' },
      { label: 'السبب', key: 'reason_code' },
      { label: 'التصرف', key: 'disposition' },
      { label: 'الخامة', key: 'fabric_name_ar' },
      { label: 'اللون', key: 'color_name_ar' },
      { label: 'الوزن (كجم)', key: 'weight_kg' },
      { label: 'التقييم (ج.م)', key: 'valuation_egp' },
      { label: 'ملاحظات', key: 'notes_ar' },
    ],
    flatten: (d) => {
      const res = d as { rows: Record<string, unknown>[] };
      return res.rows.map((r) => ({
        ...r as Record<string, string | number>,
        valuation_egp: fmt((r as Record<string, unknown>)['valuation_egp'] as string),
        roll_sr_no: String((r as Record<string, unknown>)['roll_sr_no'] ?? ''),
        notes_ar: String((r as Record<string, unknown>)['notes_ar'] ?? ''),
      }));
    },
  },
  salesByPaymentMethod: {
    titleAr: ar.reports.salesByPaymentMethod,
    needsDateRange: true,
    columns: [
      { label: 'وسيلة الدفع', key: 'method_ar' },
      { label: 'نوع الدفع', key: 'kind_ar' },
      { label: 'عدد العمليات', key: 'count' },
      { label: 'الإجمالي (ج.م)', key: 'total_egp' },
    ],
    flatten: (d) => {
      const res = d as { rows: Array<{ method: string; payment_kind: string; count: number; total_egp: string }> };
      return res.rows.map((r) => ({
        method_ar: r.method === 'cash' ? 'نقدي' : 'انستاباي',
        kind_ar: r.payment_kind === 'deposit' ? 'عربون' : 'دفعة نهائية',
        count: String(r.count),
        total_egp: fmt(r.total_egp),
      }));
    },
  },
  auditLog: {
    titleAr: ar.reports.auditLog,
    needsDateRange: true,
    columns: [
      { label: 'التاريخ', key: 'created_at' },
      { label: 'المستخدم', key: 'actor' },
      { label: 'الإجراء', key: 'action' },
      { label: 'الكيان', key: 'entity' },
      { label: 'المعرف', key: 'entity_id' },
      { label: 'الخطورة', key: 'severity' },
      { label: 'وسم', key: 'tag' },
    ],
    flatten: (d) => {
      const res = d as { rows: Record<string, unknown>[] };
      return res.rows.map((r) => ({
        ...r as Record<string, string | number>,
        entity_id: String((r as Record<string, unknown>)['entity_id'] ?? ''),
        tag: String((r as Record<string, unknown>)['tag'] ?? ''),
      }));
    },
  },
  customerLedger: {
    titleAr: ar.reports.customerLedger,
    needsDateRange: true,
    needsCustomer: true,
    columns: [
      { label: 'التاريخ', key: 'created_at' },
      { label: 'النوع', key: 'entry_type' },
      { label: 'الاتجاه', key: 'direction' },
      { label: 'المبلغ (ج.م)', key: 'amount_egp' },
      { label: 'رقم الفاتورة', key: 'invoice_no' },
      { label: 'الرصيد المتراكم', key: 'running_balance_egp' },
      { label: 'ملاحظات', key: 'notes_ar' },
    ],
    flatten: (d) => {
      const res = d as { entries: Record<string, unknown>[] };
      return res.entries.map((r) => ({
        ...r as Record<string, string | number>,
        invoice_no: String((r as Record<string, unknown>)['invoice_no'] ?? ''),
        notes_ar: String((r as Record<string, unknown>)['notes_ar'] ?? ''),
        amount_egp: fmt((r as Record<string, unknown>)['amount_egp'] as string),
        running_balance_egp: fmt((r as Record<string, unknown>)['running_balance_egp'] as string),
      }));
    },
  },
};

function cairoToday(): string {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }))
    .toISOString()
    .slice(0, 10);
}

export function SecondaryReportPage() {
  const { reportKey } = useParams<{ reportKey: string }>();
  const key = reportKey ?? '';
  const config = REPORT_CONFIGS[key];

  const [range, setRange] = useState<DateRange>({ from: cairoToday(), to: cairoToday() });
  const [customerId, setCustomerId] = useState('');

  const params: Record<string, string | number | undefined> = {
    from: range.from,
    to: range.to,
    ...(config?.needsCustomer && customerId ? { customerId: Number(customerId) } : {}),
  };

  const enabled = !config?.needsCustomer || Boolean(customerId);

  const { data, isLoading, error } = useQuery({
    queryKey: ['report-secondary', key, range.from, range.to, customerId],
    queryFn: () => reportsApi.getSecondary(key, params),
    enabled,
  });

  if (!config) {
    return <div className="p-4 text-destructive">تقرير غير موجود: {key}</div>;
  }

  const token = localStorage.getItem('ramex_token') ?? '';
  const exportParams = new URLSearchParams({ from: range.from, to: range.to, token, ...(customerId ? { customerId } : {}) });
  const pdfUrl = `/api/reports/secondary/${key}/export?${exportParams}&format=pdf`;
  const excelUrl = `/api/reports/secondary/${key}/export?${exportParams}&format=excel`;
  const printUrl = `/api/reports/secondary/${key}/export?${exportParams}&format=print`;

  const rows = data ? (config.flatten ? config.flatten(data) : (Array.isArray(data) ? data : [])) : [];
  const totals = data && config.totals ? config.totals(data) : undefined;

  return (
    <ReportShell
      title={config.titleAr}
      showDateRange={config.needsDateRange}
      dateRange={range}
      onDateRangeChange={setRange}
      exportPdfUrl={enabled ? pdfUrl : undefined}
      exportExcelUrl={enabled ? excelUrl : undefined}
      printUrl={enabled ? printUrl : undefined}
      loading={isLoading}
      extraFilters={
        config.needsCustomer ? (
          <div>
            <Label className="text-xs">{ar.reports.selectCustomer} (ID)</Label>
            <Input
              type="number" inputMode="decimal"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="رقم العميل"
              className="w-32"
            />
          </div>
        ) : undefined
      }
    >
      {error && (
        <div className="text-destructive text-sm">حدث خطأ في تحميل البيانات</div>
      )}
      {!enabled && (
        <div className="text-muted-foreground text-sm text-center py-8">
          {ar.reports.selectCustomer} لعرض التقرير
        </div>
      )}
      {enabled && !isLoading && (
        <ReportTable
          columns={config.columns}
          rows={rows as Record<string, string | number>[]}
          totals={totals as Record<string, string | number> | undefined}
          emptyText={ar.reports.noData}
        />
      )}
    </ReportShell>
  );
}
