import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { salesApi } from '@/lib/sales-api';
import { openPdfBlob } from '@/lib/pdf';
import type {
  FulfillmentDestination,
  InvoiceListRow,
  InvoiceStatus,
  OpenInvoiceRow,
  PendingPickupRow,
} from '@/lib/sales-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MobileFilterSheet } from '@/components/MobileFilterSheet';
import { PageShell, SectionCard } from '@/components/Layout/PageShell';
import { KpiGrid } from '@/components/dashboard/KpiGrid';
import { MetricCard } from '@/components/dashboard/MetricCard';
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
    <PageShell title={ar.invoices.title} backTo="/invoices-returns">
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
    </PageShell>
  );
}

function DefaultTab({ status }: { status?: InvoiceStatus }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [destination, setDestination] = useState<FulfillmentDestination | 'all'>('all');
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ['invoices', status, destination, dateFrom, dateTo, page],
    queryFn: () =>
      salesApi.list({
        status: status || undefined,
        fulfillment_destination: destination === 'all' ? undefined : destination,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        limit: PAGE_SIZE,
      }),
  });

  const rows: InvoiceListRow[] = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilters =
    (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (destination !== 'all' ? 1 : 0);

  const kpis = useMemo(() => {
    let revenue = 0;
    let totalPaid = 0;
    let totalBalance = 0;
    for (const r of rows) {
      revenue += Number(r.total_egp);
      totalPaid += Number(r.paid_egp);
      totalBalance += Number(r.balance_egp);
    }
    return { revenue, totalPaid, totalBalance };
  }, [rows]);

  const reprintMut = useMutation({
    mutationFn: (invoiceId: number) => salesApi.pdfBlob(invoiceId, 'reprint'),
    onSuccess: (blob) => openPdfBlob(blob),
  });

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
      <div className="space-y-1">
        <Label className="text-sm font-medium text-foreground">{ar.invoices.filterFulfillment}</Label>
        <div className="flex gap-2 flex-wrap">
          <FilterChip
            active={destination === 'all'}
            onClick={() => { setDestination('all'); setPage(1); }}
          >
            {ar.invoices.filterAll}
          </FilterChip>
          <FilterChip
            active={destination === 'shop'}
            onClick={() => { setDestination('shop'); setPage(1); }}
          >
            {ar.invoices.fulfillmentShop}
          </FilterChip>
          <FilterChip
            active={destination === 'factory_direct'}
            onClick={() => { setDestination('factory_direct'); setPage(1); }}
          >
            {ar.invoices.fulfillmentFactoryDirect}
          </FilterChip>
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
      align: 'center',
      width: '110px',
    },
    {
      key: 'date',
      header: ar.invoices.date,
      cell: (r) => <span className="text-foreground-muted whitespace-nowrap" dir="ltr">{fmtDate(r.created_at)}</span>,
      secondary: true,
      align: 'center',
      width: '150px',
    },
    {
      key: 'customer',
      header: ar.invoices.customer,
      cell: (r) => <span className="block truncate">{r.customer_name_ar}</span>,
      secondary: true,
      align: 'center',
    },
    {
      key: 'total',
      header: ar.invoices.total,
      cell: (r) => <span className="font-medium tabular-num" dir="ltr">{fmtMoney(r.total_egp)}</span>,
      align: 'center',
      width: '110px',
    },
    {
      key: 'paid',
      header: ar.invoices.paid,
      cell: (r) => <span className="tabular-num" dir="ltr">{fmtMoney(r.paid_egp)}</span>,
      align: 'center',
      width: '110px',
    },
    {
      key: 'balance',
      header: ar.invoices.balance,
      cell: (r) => <span className="tabular-num" dir="ltr">{fmtMoney(r.balance_egp)}</span>,
      align: 'center',
      width: '110px',
    },
    {
      key: 'status',
      header: ar.invoices.status,
      cell: (r) => <InvoiceStatusPill status={r.status} />,
      align: 'center',
      width: '130px',
    },
    {
      key: 'actions',
      header: ar.invoices.actions,
      cell: (r) => (
        <div className="flex gap-3 justify-center whitespace-nowrap">
          <Link to={`/invoices/${r.id}`} className="text-xs text-accent hover:text-accent-hover hover:underline underline-offset-2">
            {ar.invoices.view}
          </Link>
          <button
            type="button"
            className="text-xs text-accent hover:text-accent-hover hover:underline underline-offset-2 cursor-pointer disabled:opacity-50"
            disabled={reprintMut.isPending && reprintMut.variables === r.id}
            onClick={(e) => { e.stopPropagation(); reprintMut.mutate(r.id); }}
          >
            {ar.invoices.reprint}
          </button>
        </div>
      ),
      hideOnMobile: true,
      align: 'center',
      width: '140px',
    },
  ];

  return (
    <>
      <KpiGrid>
        <MetricCard
          label="إجمالي الفواتير"
          value={q.isLoading ? null : total}
          format="int"
          tone="accent"
          emDashOnZero={false}
          meta="عدد الفواتير"
        />
        <MetricCard
          label="إجمالي الإيرادات"
          value={q.isLoading ? null : kpis.revenue}
          format="money"
          tone="success"
          meta="إجمالي الفواتير الظاهرة"
        />
        <MetricCard
          label="المحصّل"
          value={q.isLoading ? null : kpis.totalPaid}
          format="money"
          tone="info"
          meta="إجمالي المدفوع"
        />
        <MetricCard
          label="المتبقي"
          value={q.isLoading ? null : kpis.totalBalance}
          format="money"
          tone={kpis.totalBalance > 0 ? 'warning' : 'default'}
          meta="رصيد غير محصّل"
        />
      </KpiGrid>

      <MobileFilterSheet activeCount={activeFilters}>{filterControls}</MobileFilterSheet>

      <SectionCard noPadding>
        <ResponsiveTable
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.id)}
          onRowClick={(r) => { window.location.href = `/invoices/${r.id}`; }}
          empty={ar.invoices.empty}
          isLoading={q.isLoading}
          isError={q.isError}
          onRetry={() => q.refetch()}
          resetKey={`${status ?? ''}|${destination}|${dateFrom}|${dateTo}|${page}`}
        />
      </SectionCard>

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
      align: 'center',
      width: '110px',
    },
    {
      key: 'date',
      header: ar.invoices.date,
      cell: (r) => <span className="text-foreground-muted whitespace-nowrap" dir="ltr">{fmtDate(r.created_at)}</span>,
      secondary: true,
      align: 'center',
      width: '150px',
    },
    {
      key: 'customer',
      header: ar.invoices.customer,
      cell: (r) => (
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className="block truncate">{r.customer_name_ar}</span>
          {r.line_count === 0 && (
            <StatusPill tone="info">{ar.invoices.noLinesDepositBadge}</StatusPill>
          )}
        </span>
      ),
      secondary: true,
      align: 'center',
    },
    {
      key: 'total',
      header: ar.invoices.total,
      cell: (r) => <span className="font-medium tabular-num" dir="ltr">{fmtMoney(r.total_egp)}</span>,
      align: 'center',
      width: '120px',
    },
    {
      key: 'balance',
      header: ar.invoices.balance,
      cell: (r) => <span className="tabular-num" dir="ltr">{fmtMoney(r.balance_egp)}</span>,
      align: 'center',
      width: '120px',
    },
    {
      key: 'age',
      header: ar.invoices.age,
      cell: (r) => (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <span className="tabular-num" dir="ltr">{r.age_days}</span>
          <span className="text-foreground-muted text-xs">{ar.invoices.days}</span>
          {r.is_stale && <StatusPill tone="warning">{ar.invoices.staleBadge}</StatusPill>}
        </span>
      ),
      align: 'center',
      width: '160px',
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
      align: 'center',
      width: '80px',
    },
  ];

  return (
    <SectionCard noPadding>
      <ResponsiveTable
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.id)}
        onRowClick={(r) => { window.location.href = `/invoices/${r.id}`; }}
        empty={ar.invoices.empty}
        isLoading={q.isLoading}
        isError={q.isError}
        onRetry={() => q.refetch()}
        rowClassName={(r) => (r.is_stale ? 'border-s-2 border-s-warning' : '')}
      />
    </SectionCard>
  );
}

function PendingPickupTab() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['invoices', 'pending-pickup'],
    queryFn: salesApi.listPendingPickup,
  });
  const rows: PendingPickupRow[] = q.data ?? [];

  const [pendingDeliverId, setPendingDeliverId] = useState<number | null>(null);

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
      align: 'center',
      width: '110px',
    },
    {
      key: 'date',
      header: ar.invoices.date,
      cell: (r) => <span className="text-foreground-muted whitespace-nowrap" dir="ltr">{fmtDate(r.created_at)}</span>,
      secondary: true,
      align: 'center',
      width: '150px',
    },
    {
      key: 'customer',
      header: ar.invoices.customer,
      cell: (r) => <span className="block truncate">{r.customer_name_ar}</span>,
      secondary: true,
      align: 'center',
    },
    {
      key: 'phone',
      header: ar.customers.phone,
      cell: (r) => <span className="font-mono tabular-num whitespace-nowrap" dir="ltr">{r.customer_phone}</span>,
      align: 'center',
      width: '140px',
    },
    {
      key: 'total',
      header: ar.invoices.total,
      cell: (r) => <span className="font-medium tabular-num" dir="ltr">{fmtMoney(r.total_egp)}</span>,
      align: 'center',
      width: '120px',
    },
  ];

  return (
    <>
      <SectionCard noPadding>
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
              onClick={() => setPendingDeliverId(r.id)}
              disabled={deliverMut.isPending}
            >
              {ar.invoices.markDelivered}
            </Button>
          )}
        />
      </SectionCard>
      <ConfirmDialog
        open={pendingDeliverId !== null}
        message={ar.invoices.markDeliveredConfirm}
        onConfirm={() => { deliverMut.mutate(pendingDeliverId!); setPendingDeliverId(null); }}
        onCancel={() => setPendingDeliverId(null)}
      />
    </>
  );
}
