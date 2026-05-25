import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, type DailyReport } from '@/lib/reports-api';
import { ar } from '@/i18n/ar';
import { ReportShell, ReportTable } from './ReportShell';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

function today(): string {
  const d = new Date();
  return new Date(d.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }))
    .toISOString()
    .slice(0, 10);
}

const fmt = (n: string | number) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DailyReportPage() {
  const [date, setDate] = useState(today());

  const { data, isLoading } = useQuery<DailyReport>({
    queryKey: ['report-daily', date],
    queryFn: () => reportsApi.getDaily(date),
  });

  const token = localStorage.getItem('ramex_token') ?? '';
  const pdfUrl = `/api/reports/daily/export?date=${date}&format=pdf&token=${token}`;
  const excelUrl = `/api/reports/daily/export?date=${date}&format=excel&token=${token}`;
  const printUrl = `/api/reports/daily/export?date=${date}&format=print&token=${token}`;

  return (
    <ReportShell
      title={ar.reports.daily}
      exportPdfUrl={pdfUrl}
      exportExcelUrl={excelUrl}
      printUrl={printUrl}
      showDateRange={false}
      loading={isLoading}
      extraFilters={
        <div className="space-y-1">
          <Label className="text-xs text-foreground-muted">اليوم</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 w-full sm:w-44"
          />
        </div>
      }
    >
      {data && <DailyReportContent report={data} />}
    </ReportShell>
  );
}

function SummaryStat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-elevated p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted mb-1.5">
        {label}
      </p>
      <p className="text-2xl font-semibold text-foreground tabular-num leading-none" dir="ltr">
        {value}
      </p>
      {suffix && <p className="text-xs text-foreground-tertiary mt-1.5">{suffix}</p>}
    </div>
  );
}

export function DailyReportContent({ report }: { report: DailyReport }) {
  const ss = report.sales_summary;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Shift window meta */}
      <p className="text-xs text-foreground-tertiary tabular-num" dir="ltr">
        {ar.reports.shiftWindow}: {report.shift_start_cairo} → {report.shift_end_cairo} ·{' '}
        {ar.reports.generatedAt}: {report.generated_at}
      </p>

      {/* 1. Sales summary */}
      <ReportTable
        title="1. ملخص المبيعات"
        columns={[
          { label: 'البيان', key: 'label' },
          { label: 'القيمة (ج.م)', key: 'value' },
        ]}
        rows={[
          { label: 'عدد الفواتير المكتملة', value: ss.invoice_count },
          { label: 'إجمالي المبيعات (قبل الخصم)', value: fmt(ss.gross_subtotal_egp) },
          { label: 'إجمالي الخصم على الفاتورة', value: fmt(ss.total_cart_discount_egp) },
          { label: 'الصافي', value: fmt(ss.total_net_egp) },
          { label: 'عدد المرتجعات', value: ss.refund_count },
          { label: 'إجمالي المرتجعات', value: fmt(ss.refund_total_egp) },
          { label: 'عدد الملغيات', value: ss.void_count },
          { label: 'إجمالي الملغيات', value: fmt(ss.void_total_egp) },
        ]}
      />

      {/* 2. Discounts */}
      <ReportTable
        title="2. الخصومات"
        columns={[
          { label: 'رقم الفاتورة', key: 'invoice_no' },
          { label: 'خصم الفاتورة (ج.م)', key: 'cart_discount_egp' },
          { label: 'خصم الأصناف (ج.م)', key: 'line_discounts_egp' },
          { label: 'الإجمالي (ج.م)', key: 'total_discount_egp' },
        ]}
        rows={report.discounts.map((d) => ({
          ...d,
          cart_discount_egp: fmt(d.cart_discount_egp),
          line_discounts_egp: fmt(d.line_discounts_egp),
          total_discount_egp: fmt(d.total_discount_egp),
        }))}
        emptyText="لا توجد خصومات اليوم"
      />

      {/* 3. Refunds & Voids */}
      <ReportTable
        title="3. المرتجعات والملغيات"
        columns={[
          { label: 'النوع', key: 'type_ar' },
          { label: 'رقم الفاتورة', key: 'invoice_no' },
          { label: 'المبلغ (ج.م)', key: 'amount_egp' },
          { label: 'الوقت', key: 'created_at' },
          { label: 'ملاحظات', key: 'notes_ar' },
        ]}
        rows={report.refunds_voids.map((r) => ({
          ...r,
          type_ar: r.type === 'refund' ? 'مرتجع' : 'ملغي',
          amount_egp: fmt(r.amount_egp),
          notes_ar: r.notes_ar ?? '',
        }))}
        emptyText="لا توجد مرتجعات أو ملغيات اليوم"
      />

      {/* 4. Cash */}
      <div className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
          4. الخزنة الكاش
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryStat label="الرصيد الافتتاحي" value={fmt(report.cash.opening_balance_egp)} suffix="ج.م" />
          <SummaryStat label="إجمالي الداخل" value={fmt(report.cash.total_in_egp)} suffix="ج.م" />
          <SummaryStat label="إجمالي الخارج" value={fmt(report.cash.total_out_egp)} suffix="ج.م" />
          <SummaryStat label="الرصيد الختامي" value={fmt(report.cash.closing_balance_egp)} suffix="ج.م" />
        </div>
        <ReportTable
          columns={[
            { label: 'الاتجاه', key: 'dir_ar' },
            { label: 'النوع', key: 'event_type' },
            { label: 'المبلغ (ج.م)', key: 'amount_egp' },
            { label: 'الوقت', key: 'created_at' },
            { label: 'ملاحظات', key: 'notes_ar' },
          ]}
          rows={report.cash.movements.map((m) => ({
            ...m,
            dir_ar: m.direction === 'in' ? '↑ داخل' : '↓ خارج',
            amount_egp: fmt(m.amount_egp),
            notes_ar: m.notes_ar ?? '',
          }))}
          emptyText="لا توجد حركات كاش اليوم"
        />
      </div>

      {/* 5. Sales by fabric */}
      <ReportTable
        title="5. المبيعات حسب الخامة واللون"
        columns={[
          { label: 'الخامة', key: 'fabric_name_ar' },
          { label: 'اللون', key: 'color_name_ar' },
          { label: 'رقم التوب', key: 'roll_sr_no' },
          { label: 'الوزن (كجم)', key: 'weight_kg' },
          { label: 'الإيراد (ج.م)', key: 'revenue_egp' },
        ]}
        rows={report.sales_by_fabric.map((r) => ({
          ...r,
          roll_sr_no: r.roll_sr_no ?? '',
          revenue_egp: fmt(r.revenue_egp),
        }))}
        emptyText="لا توجد مبيعات اليوم"
      />

      {/* 6. Open invoices summary */}
      <ReportTable
        title="6. الفواتير المفتوحة"
        columns={[
          { label: 'البيان', key: 'label' },
          { label: 'العدد', key: 'count' },
          { label: 'القيمة (ج.م)', key: 'value' },
        ]}
        rows={[
          {
            label: 'فواتير مفتوحة اليوم',
            count: report.open_invoices_summary.opened_today_count,
            value: fmt(report.open_invoices_summary.opened_today_value_egp),
          },
          {
            label: 'فواتير أُغلقت اليوم',
            count: report.open_invoices_summary.closed_today_count,
            value: fmt(report.open_invoices_summary.closed_today_value_egp),
          },
        ]}
      />

      {/* 7. Stock movements */}
      <ReportTable
        title="7. حركات المخزون"
        columns={[
          { label: 'نوع الحركة', key: 'event_type' },
          { label: 'العدد', key: 'count' },
        ]}
        rows={report.stock_movements.map((m) => ({
          event_type: m.event_type,
          count: String(m.count),
        }))}
        emptyText="لا توجد حركات مخزون اليوم"
      />
    </div>
  );
}
