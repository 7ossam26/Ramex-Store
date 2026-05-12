import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { salesApi } from '@/lib/sales-api';
import type {
  InvoiceListRow,
  InvoiceStatus,
  OpenInvoiceRow,
  PendingPickupRow,
} from '@/lib/sales-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { MobileFilterSheet } from '@/components/MobileFilterSheet';
import { PageHeader } from '@/components/PageHeader';
import { FilterChip } from '@/components/FilterChip';
import { InvoiceStatusPill } from '@/components/invoices/InvoiceStatusPill';
import { StatusPill } from '@/components/StatusPill';

const PAGE_SIZE = 30;

type TabKey = 'all' | 'open' | 'pending_pickup' | 'completed' | 'cancelled';

const TAB_TO_STATUS: Record<TabKey, InvoiceStatus | undefined> = {
  all: undefined,
  open: 'open',
  pending_pickup: 'closed_pending_pickup',
  completed: 'completed',
  cancelled: 'cancelled',
};

const TAB_ORDER: TabKey[] = ['all', 'open', 'pending_pickup', 'completed', 'cancelled'];

function fmtMoney(s: string | number): string {
  return Number(s).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    timeZone: 'Africa/Cairo',
    day: '2-digit', month: '2-digit', year: 'numeric',
  }) + ' ' + d.toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function InvoicesListPage() {
  const [tab, setTab] = useState<TabKey>('all');

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <PageHeader title={ar.invoices.title} />

      {/* Filter chip row */}
      <div className="flex gap-2 overflow-x-auto -mx-3 md:mx-0 px-3 md:px-0 pb-1">
        {TAB_ORDER.map((k) => (
          <FilterChip key={k} active={tab === k} onClick={() => setTab(k)}>
            {ar.invoices.tabs[k]}
          </FilterChip>
        ))}
      </div>

      {tab === 'open' ? (
        <OpenInvoicesTab />
      ) : tab === 'pending_pickup' ? (
        <PendingPickupTab />
      ) : (
        <DefaultTab status={TAB_TO_STATUS[tab]} />
      )}
    </div>
  );
}

function DefaultTab({ status }: { status?: InvoiceStatus }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ['invoices', status, dateFrom, dateTo, page],
    queryFn: () =>
      salesApi.list({
        status: status || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        limit: PAGE_SIZE,
      }),
  });

  const rows: InvoiceListRow[] = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilters = (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  const filterControls = (
    <div className="rounded-lg border border-border-subtle bg-surface-elevated p-3 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-sm font-medium text-foreground">{ar.invoices.filterDateFrom}</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            dir="ltr"
            className="h-11 md:h-10"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-sm font-medium text-foreground">{ar.invoices.filterDateTo}</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            dir="ltr"
            className="h-11 md:h-10"
          />
        </div>
      </div>
    </div>
  );

  const columns: Column<InvoiceListRow>[] = [
    {
      key: 'no',
      header: ar.invoices.no,
      cell: (r) => (
        <Link to={`/invoices/${r.id}`} className="text-accent hover:text-accent-hover hover:underline underline-offset-2 font-mono text-xs tabular-num">
          {r.invoice_no}
        </Link>
      ),
      primary: true,
    },
    { key: 'date', header: ar.invoices.date, cell: (r) => <span className="text-foreground-muted" dir="ltr">{fmtDate(r.created_at)}</span>, secondary: true },
    { key: 'customer', header: ar.invoices.customer, cell: (r) => r.customer_name_ar, secondary: true },
    {
      key: 'total',
      header: ar.invoices.total,
      cell: (r) => <span className="font-medium tabular-num" dir="ltr">{fmtMoney(r.total_egp)}</span>,
    },
    { key: 'paid', header: ar.invoices.paid, cell: (r) => <span className="tabular-num" dir="ltr">{fmtMoney(r.paid_egp)}</span> },
    { key: 'balance', header: ar.invoices.balance, cell: (r) => <span className="tabular-num" dir="ltr">{fmtMoney(r.balance_egp)}</span> },
    { key: 'status', header: ar.invoices.status, cell: (r) => <InvoiceStatusPill status={r.status} /> },
    {
      key: 'actions',
      header: ar.invoices.actions,
      cell: (r) => (
        <div className="flex gap-3">
          <Link to={`/invoices/${r.id}`} className="text-xs text-accent hover:text-accent-hover hover:underline underline-offset-2">
            {ar.invoices.view}
          </Link>
          <a
            className="text-xs text-accent hover:text-accent-hover hover:underline underline-offset-2"
            href={salesApi.pdfUrl(r.id, 'reprint')}
            target="_blank"
            rel="noreferrer"
          >
            {ar.invoices.reprint}
          </a>
        </div>
      ),
      hideOnMobile: true,
    },
  ];

  return (
    <>
      <MobileFilterSheet activeCount={activeFilters}>{filterControls}</MobileFilterSheet>

      <ResponsiveTable
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.id)}
        onRowClick={(r) => { window.location.href = `/invoices/${r.id}`; }}
        empty={ar.invoices.empty}
        isLoading={q.isLoading}
        isError={q.isError}
        onRetry={() => q.refetch()}
        resetKey={`${status ?? ''}|${dateFrom}|${dateTo}|${page}`}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</Button>
          <span className="text-sm text-foreground-muted">
            صفحة <span className="tabular-num text-foreground" dir="ltr">{page}</span> من <span className="tabular-num text-foreground" dir="ltr">{totalPages}</span>
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>التالي</Button>
        </div>
      )}
    </>
  );
}

function OpenInvoicesTab() {
  const q = useQuery({
    queryKey: ['invoices', 'open-list'],
    queryFn: salesApi.listOpen,
  });
  const rows: OpenInvoiceRow[] = q.data ?? [];

  const columns: Column<OpenInvoiceRow>[] = [
    {
      key: 'no',
      header: ar.invoices.no,
      cell: (r) => (
        <Link to={`/invoices/${r.id}`} className="text-accent hover:text-accent-hover hover:underline underline-offset-2 font-mono text-xs tabular-num">
          {r.invoice_no}
        </Link>
      ),
      primary: true,
    },
    { key: 'date', header: ar.invoices.date, cell: (r) => <span className="text-foreground-muted" dir="ltr">{fmtDate(r.created_at)}</span>, secondary: true },
    { key: 'customer', header: ar.invoices.customer, cell: (r) => r.customer_name_ar, secondary: true },
    { key: 'total', header: ar.invoices.total, cell: (r) => <span className="font-medium tabular-num" dir="ltr">{fmtMoney(r.total_egp)}</span> },
    { key: 'balance', header: ar.invoices.balance, cell: (r) => <span className="tabular-num" dir="ltr">{fmtMoney(r.balance_egp)}</span> },
    {
      key: 'age',
      header: ar.invoices.age,
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          <span className="tabular-num" dir="ltr">{r.age_days}</span>
          <span className="text-foreground-muted text-xs">{ar.invoices.days}</span>
          {r.is_stale && <StatusPill tone="warning">{ar.invoices.staleBadge}</StatusPill>}
        </span>
      ),
    },
    {
      key: 'actions',
      header: ar.invoices.actions,
      cell: (r) => (
        <Link to={`/invoices/${r.id}`} className="text-xs text-accent hover:text-accent-hover hover:underline underline-offset-2">
          {ar.invoices.view}
        </Link>
      ),
      hideOnMobile: true,
    },
  ];

  return (
    <ResponsiveTable
      columns={columns}
      rows={rows}
      rowKey={(r) => String(r.id)}
      onRowClick={(r) => { window.location.href = `/invoices/${r.id}`; }}
      empty={ar.invoices.empty}
      isLoading={q.isLoading}
      isError={q.isError}
      onRetry={() => q.refetch()}
      rowClassName={(r) => (r.is_stale ? 'border-r-2 border-r-warning' : '')}
    />
  );
}

function PendingPickupTab() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['invoices', 'pending-pickup'],
    queryFn: salesApi.listPendingPickup,
  });
  const rows: PendingPickupRow[] = q.data ?? [];

  const deliverMut = useMutation({
    mutationFn: (id: number) => salesApi.markDelivered(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); },
  });

  const columns: Column<PendingPickupRow>[] = [
    {
      key: 'no',
      header: ar.invoices.no,
      cell: (r) => (
        <Link to={`/invoices/${r.id}`} className="text-accent hover:text-accent-hover hover:underline underline-offset-2 font-mono text-xs tabular-num">
          {r.invoice_no}
        </Link>
      ),
      primary: true,
    },
    { key: 'date', header: ar.invoices.date, cell: (r) => <span className="text-foreground-muted" dir="ltr">{fmtDate(r.created_at)}</span>, secondary: true },
    { key: 'customer', header: ar.invoices.customer, cell: (r) => r.customer_name_ar, secondary: true },
    { key: 'phone', header: ar.customers.phone, cell: (r) => <span className="font-mono tabular-num" dir="ltr">{r.customer_phone}</span> },
    { key: 'total', header: ar.invoices.total, cell: (r) => <span className="font-medium tabular-num" dir="ltr">{fmtMoney(r.total_egp)}</span> },
  ];

  return (
    <ResponsiveTable
      columns={columns}
      rows={rows}
      rowKey={(r) => String(r.id)}
      empty={ar.invoices.empty}
      isLoading={q.isLoading}
      isError={q.isError}
      onRetry={() => q.refetch()}
      actions={(r) => (
        <Button
          size="sm"
          onClick={() => {
            if (window.confirm(ar.invoices.markDeliveredConfirm)) {
              deliverMut.mutate(r.id);
            }
          }}
          disabled={deliverMut.isPending}
        >
          {ar.invoices.markDelivered}
        </Button>
      )}
    />
  );
}
