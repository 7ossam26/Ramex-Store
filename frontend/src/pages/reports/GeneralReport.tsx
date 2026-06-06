import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShoppingCart,
  FileText,
  Download,
  Printer,
  RefreshCw,
} from 'lucide-react';
import { reportsApi, type GeneralReport } from '@/lib/reports-api';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ar } from '@/i18n/ar';
import { Skeleton } from '@/components/Skeleton';
import { ReportTable } from './ReportShell';
import { SecondaryReportChart } from './SecondaryReportChart';

function cairoToday(): string {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }),
  )
    .toISOString()
    .slice(0, 10);
}

const fmt = (n: string | number) =>
  Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

type StatCardProps = {
  label: string;
  value: string | number;
  suffix?: string;
  icon: React.ReactNode;
  highlight?: boolean;
};

function StatCard({ label, value, suffix, icon, highlight }: StatCardProps) {
  return (
    <div
      className={`rounded-xl border p-5 flex items-start gap-4 shadow-sm ${
        highlight
          ? 'border-accent/30 bg-accent-subtle/30'
          : 'border-border-subtle bg-surface-elevated'
      }`}
    >
      <span
        className={`size-10 rounded-lg inline-flex items-center justify-center shrink-0 ${
          highlight
            ? 'bg-accent/10 text-accent'
            : 'bg-surface-hover text-foreground-muted'
        }`}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-foreground-muted mb-1 leading-none">{label}</p>
        <p className="text-2xl font-bold text-foreground tabular-num leading-tight" dir="ltr">
          {value}
        </p>
        {suffix && (
          <p className="text-xs text-foreground-tertiary mt-0.5">{suffix}</p>
        )}
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-elevated p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground mb-4">{title}</h2>
      {children}
    </div>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-elevated shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border-subtle bg-surface-hover/40">
        {icon && <span className="text-foreground-muted">{icon}</span>}
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border-subtle bg-surface-elevated p-5 h-24" />
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border-subtle bg-surface-elevated p-5 h-64" />
        <div className="rounded-xl border border-border-subtle bg-surface-elevated p-5 h-64" />
      </div>
      <div className="rounded-xl border border-border-subtle bg-surface-elevated h-32" />
    </div>
  );
}

function GeneralReportContent({ report }: { report: GeneralReport }) {
  const { summary, hourly_sales, sales_by_fabric, store_rows } = report;

  const hourlyChartData = hourly_sales.map((h) => ({
    name: h.hour,
    value: h.total_egp,
  }));

  const storeTableRows = store_rows.map((r) => ({
    store_name_ar: r.store_name_ar,
    total_sales_egp: fmt(r.total_sales_egp),
    invoice_count: String(r.invoice_count),
    avg_invoice_egp: fmt(r.avg_invoice_egp),
  }));

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label="إجمالي المبيعات"
          value={fmt(summary.total_sales_egp)}
          suffix="ج.م"
          icon={<ShoppingCart className="size-5" />}
          highlight
        />
        <StatCard
          label="عدد الفواتير"
          value={summary.invoice_count}
          icon={<FileText className="size-5" />}
        />
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <ChartCard title="حركة المبيعات">
          <SecondaryReportChart
            type="line"
            data={hourlyChartData}
            seriesLabel="المبيعات"
            isCurrency
          />
        </ChartCard>
        <ChartCard title="توزيع المبيعات حسب الخامة">
          <SecondaryReportChart
            type="pie"
            data={sales_by_fabric}
            isCurrency
          />
        </ChartCard>
      </div>

      {/* Store sales table */}
      <SectionCard title="تفاصيل المبيعات" icon={<FileText className="size-4" />}>
        <ReportTable
          columns={[
            { label: 'الفرع', key: 'store_name_ar' },
            { label: 'المبيعات (ج.م)', key: 'total_sales_egp' },
            { label: 'عدد الفواتير', key: 'invoice_count' },
            { label: 'متوسط الفاتورة (ج.م)', key: 'avg_invoice_egp' },
          ]}
          rows={storeTableRows}
          emptyText="لا توجد مبيعات في هذه الفترة"
        />
      </SectionCard>

    </div>
  );
}

export function GeneralReportPage() {
  const today = cairoToday();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [committedFrom, setCommittedFrom] = useState(today);
  const [committedTo, setCommittedTo] = useState(today);

  const { data, isLoading, isFetching } = useQuery<GeneralReport>({
    queryKey: ['report-general', committedFrom, committedTo],
    queryFn: () => reportsApi.getGeneral(committedFrom, committedTo),
  });

  function refresh() {
    setCommittedFrom(from);
    setCommittedTo(to);
  }

  const token = localStorage.getItem('ramex_token') ?? '';
  const exportBase = `/api/reports/general/export?from=${committedFrom}&to=${committedTo}&token=${token}`;
  const pdfUrl   = `${exportBase}&format=pdf`;
  const excelUrl = `${exportBase}&format=excel`;
  const printUrl = `${exportBase}&format=print`;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <PageHeader
        title="التقرير العام"
        description="ملخص أداء المبيعات والمخزون"
        backTo="/reports"
        actions={
          <span className="contents print:hidden">
            <Button asChild variant="outline" size="sm">
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                <FileText className="size-4" aria-hidden />
                {ar.reports.exportPdf}
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={excelUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                <Download className="size-4" aria-hidden />
                {ar.reports.exportExcel}
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={printUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                <Printer className="size-4" aria-hidden />
                {ar.reports.print}
              </a>
            </Button>
          </span>
        }
      />

      {/* Filter bar */}
      <div className="rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-sm flex flex-wrap items-end gap-4 print:hidden">
        <div className="space-y-1">
          <Label className="text-xs text-foreground-muted">من تاريخ</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-10 w-44"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-foreground-muted">إلى تاريخ</Label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-10 w-44"
          />
        </div>
        <Button
          onClick={refresh}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
          تحديث التقرير
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <ReportSkeleton />
      ) : data ? (
        <GeneralReportContent report={data} />
      ) : null}
    </div>
  );
}
