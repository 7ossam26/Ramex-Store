import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, type DailyReport } from '@/lib/reports-api';
import { ar } from '@/i18n/ar';
import { ReportShell, ReportTable } from './ReportShell';

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
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground">اليوم</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="block border border-border rounded px-2 py-1 text-sm"
            />
          </div>
        </div>
      }
    >
      {data && <DailyReportContent report={data} />}
    </ReportShell>
  );
}

function DailyReportContent({ report }: { report: DailyReport }) {
  const ss = report.sales_summary;

  return (
    <div className="space-y-6">
      {/* Shift window */}
      <p className="text-xs text-muted-foreground">
        {ar.reports.shiftWindow}: {report.shift_start_cairo} → {report.shift_end_cairo} |{' '}
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
          { label: 'الضريبة', value: fmt(ss.total_tax_egp) },
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
      <div>
        <h2 className="font-semibold text-sm text-muted-foreground mb-2">4. الخزنة الكاش</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {[
            { label: 'الرصيد الافتتاحي', value: fmt(report.cash.opening_balance_egp) },
            { label: 'إجمالي الداخل', value: fmt(report.cash.total_in_egp) },
            { label: 'إجمالي الخارج', value: fmt(report.cash.total_out_egp) },
            { label: 'الرصيد الختامي', value: fmt(report.cash.closing_balance_egp) },
          ].map((item) => (
            <div key={item.label} className="bg-card border border-border rounded p-3">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="font-bold text-lg">{item.value} ج.م</p>
            </div>
          ))}
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

      {/* 5. Bank movements */}
      <ReportTable
        title="5. حركات البنوك"
        columns={[
          { label: 'البنك', key: 'bank_name_ar' },
          { label: 'الاتجاه', key: 'dir_ar' },
          { label: 'النوع', key: 'event_type' },
          { label: 'المبلغ (ج.م)', key: 'amount_egp' },
          { label: 'الوقت', key: 'created_at' },
        ]}
        rows={report.bank_movements.map((m) => ({
          ...m,
          dir_ar: m.direction === 'in' ? '↑ داخل' : '↓ خارج',
          amount_egp: fmt(m.amount_egp),
        }))}
        emptyText="لا توجد حركات بنكية اليوم"
      />

      {/* 6. Sales by fabric */}
      <ReportTable
        title="6. المبيعات حسب الخامة واللون"
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

      {/* 7. Open invoices summary */}
      <ReportTable
        title="7. الفواتير المفتوحة"
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

      {/* 8. Stock movements */}
      <ReportTable
        title="8. حركات المخزون"
        columns={[
          { label: 'نوع الحركة', key: 'event_type' },
          { label: 'العدد', key: 'count' },
        ]}
        rows={report.stock_movements.map((m) => ({ event_type: m.event_type, count: String(m.count) }))}
        emptyText="لا توجد حركات مخزون اليوم"
      />
    </div>
  );
}
