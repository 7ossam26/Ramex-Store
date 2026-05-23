import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { returnsApi } from '@/lib/returns-api';
import type { ReturnListRow } from '@/lib/returns-types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { MobileFilterSheet } from '@/components/MobileFilterSheet';
import { PageHeader } from '@/components/PageHeader';
import { KpiGrid } from '@/components/dashboard/KpiGrid';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { StatusPill } from '@/components/StatusPill';

function fmtMoney(s: string | number): string {
  return Number(s).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-GB', {
      timeZone: 'Africa/Cairo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }) +
    ' ' +
    d.toLocaleTimeString('en-GB', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  );
}

export function ReturnsListPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const q = useQuery<{ rows: ReturnListRow[]; total: number }>({
    queryKey: ['returns', dateFrom, dateTo, page],
    queryFn: () =>
      returnsApi.list({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        limit: 30,
      }),
  });

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 30));
  const activeFilters = (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  const kpis = useMemo(() => {
    let totalRefund = 0;
    let refunds = 0;
    let exchanges = 0;
    for (const r of rows) {
      totalRefund += Number(r.total_refund_egp);
      if (r.kind === 'refund') refunds += 1;
      else exchanges += 1;
    }
    return { totalRefund, refunds, exchanges };
  }, [rows]);

  const columns: Column<ReturnListRow>[] = [
    {
      key: 'return_no',
      header: ar.returns.returnNo,
      cell: (r) => (
        <span className="font-mono text-xs tabular-num text-foreground" dir="ltr">{r.return_no}</span>
      ),
      primary: true,
    },
    {
      key: 'date',
      header: ar.returns.date,
      cell: (r) => <span className="text-xs text-foreground-muted" dir="ltr">{fmtDate(r.processed_at)}</span>,
      secondary: true,
    },
    {
      key: 'orig',
      header: ar.returns.originalInvoice,
      cell: (r) => (
        <Link
          to={`/invoices/${r.original_invoice_id}`}
          className="text-accent hover:text-accent-hover hover:underline underline-offset-2 font-mono text-xs tabular-num"
        >
          {r.original_invoice_no}
        </Link>
      ),
    },
    { key: 'customer', header: ar.returns.customer, cell: (r) => r.customer_name_ar },
    {
      key: 'kind',
      header: ar.returns.kind,
      cell: (r) => (
        <StatusPill tone={r.kind === 'refund' ? 'danger' : 'info'}>
          {r.kind === 'refund' ? ar.returns.kinds.refund : ar.returns.kinds.exchange}
        </StatusPill>
      ),
    },
    {
      key: 'total',
      header: ar.returns.totalRefund,
      cell: (r) => (
        <span className="font-medium tabular-num" dir="ltr">{fmtMoney(r.total_refund_egp)}</span>
      ),
    },
    {
      key: 'method',
      header: ar.returns.refundMethod,
      cell: (r) => <span className="text-xs text-foreground-muted">{ar.returns.refundMethods[r.refund_method]}</span>,
    },
    {
      key: 'view',
      header: '',
      cell: (r) => (
        <Link to={`/returns/${r.id}`} className="text-xs text-accent hover:text-accent-hover hover:underline underline-offset-2">
          {ar.invoices.view}
        </Link>
      ),
      align: 'end',
      hideOnMobile: true,
    },
  ];

  const filterControls = (
    <div className="rounded-lg border border-border-subtle bg-surface-elevated p-3 flex flex-wrap md:flex-nowrap gap-3 items-end">
      <div className="space-y-1 flex-1 min-w-0">
        <Label className="text-sm font-medium text-foreground">{ar.invoices.filterDateFrom}</Label>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="h-11 md:h-10 w-full md:w-44"
          dir="ltr"
        />
      </div>
      <div className="space-y-1 flex-1 min-w-0">
        <Label className="text-sm font-medium text-foreground">{ar.invoices.filterDateTo}</Label>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="h-11 md:h-10 w-full md:w-44"
          dir="ltr"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-11 md:h-10"
        onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
      >
        {ar.common.refresh}
      </Button>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <PageHeader title={ar.returns.title} description={ar.hubs.returnsDesc} backTo="/invoices-returns" />

      <KpiGrid className="lg:grid-cols-3">
        <MetricCard
          label="إجمالي المرتجعات"
          value={q.isLoading ? null : total}
          format="int"
          tone="accent"
          emDashOnZero={false}
          meta="عدد المرتجعات"
        />
        <MetricCard
          label="قيمة المرتجعات"
          value={q.isLoading ? null : kpis.totalRefund}
          format="money"
          tone="danger"
          meta="إجمالي المبالغ المستردة"
        />
        <MetricCard
          label="استبدالات"
          value={q.isLoading ? null : kpis.exchanges}
          format="int"
          tone="info"
          emDashOnZero={false}
          meta="عمليات الاستبدال"
        />
      </KpiGrid>

      {/* Filters: inline ≥md, bottom sheet <md */}
      <MobileFilterSheet activeCount={activeFilters}>
        {filterControls}
      </MobileFilterSheet>

      <ResponsiveTable
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.id)}
        onRowClick={(r) => { window.location.href = `/returns/${r.id}`; }}
        empty={ar.returns.empty}
        isLoading={q.isLoading}
        isError={q.isError}
        onRetry={() => q.refetch()}
        resetKey={`${dateFrom}|${dateTo}|${page}`}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            السابق
          </Button>
          <span className="text-sm text-foreground-muted self-center tabular-num" dir="ltr">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            التالي
          </Button>
        </div>
      )}
    </div>
  );
}
