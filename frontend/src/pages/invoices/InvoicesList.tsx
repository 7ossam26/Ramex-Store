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
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { MobileFilterSheet } from '@/components/MobileFilterSheet';

const PAGE_SIZE = 30;
const STALE_DAYS_DEFAULT = 7;

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  open: 'bg-amber-100 text-amber-800',
  closed_pending_pickup: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

type TabKey = 'all' | 'open' | 'pending_pickup' | 'completed' | 'cancelled';

const TAB_TO_STATUS: Record<TabKey, InvoiceStatus | undefined> = {
  all: undefined,
  open: 'open',
  pending_pickup: 'closed_pending_pickup',
  completed: 'completed',
  cancelled: 'cancelled',
};

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

function StatusPill({ status }: { status: InvoiceStatus }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs ${STATUS_COLORS[status]}`}>
      {ar.invoices.statuses[status]}
    </span>
  );
}

export function InvoicesListPage() {
  const [tab, setTab] = useState<TabKey>('all');

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">{ar.invoices.title}</h1>

      <div className="border-b border-border overflow-x-auto -mx-3 md:mx-0 px-3 md:px-0">
        <div className="flex gap-1 whitespace-nowrap">
          {(['all', 'open', 'pending_pickup', 'completed', 'cancelled'] as TabKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-3 text-sm border-b-2 -mb-px transition-colors min-h-11 ${
                tab === k
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {ar.invoices.tabs[k]}
            </button>
          ))}
        </div>
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

  const { data, isLoading } = useQuery({
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

  const rows: InvoiceListRow[] = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilters = (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  const filterControls = (
    <Card>
      <CardContent className="p-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>{ar.invoices.filterDateFrom}</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              dir="ltr"
              className="h-11 md:h-10"
            />
          </div>
          <div className="space-y-1">
            <Label>{ar.invoices.filterDateTo}</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              dir="ltr"
              className="h-11 md:h-10"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const columns: Column<InvoiceListRow>[] = [
    {
      key: 'no',
      header: ar.invoices.no,
      cell: (r) => (
        <Link to={`/invoices/${r.id}`} className="text-primary hover:underline font-mono text-xs">
          {r.invoice_no}
        </Link>
      ),
      primary: true,
    },
    { key: 'date', header: ar.invoices.date, cell: (r) => <span dir="ltr">{fmtDate(r.created_at)}</span>, secondary: true },
    { key: 'customer', header: ar.invoices.customer, cell: (r) => r.customer_name_ar, secondary: true },
    {
      key: 'total',
      header: ar.invoices.total,
      cell: (r) => <span className="font-medium" dir="ltr">{fmtMoney(r.total_egp)}</span>,
    },
    { key: 'paid', header: ar.invoices.paid, cell: (r) => <span dir="ltr">{fmtMoney(r.paid_egp)}</span> },
    { key: 'balance', header: ar.invoices.balance, cell: (r) => <span dir="ltr">{fmtMoney(r.balance_egp)}</span> },
    { key: 'status', header: ar.invoices.status, cell: (r) => <StatusPill status={r.status} /> },
    {
      key: 'actions',
      header: ar.invoices.actions,
      cell: (r) => (
        <div className="space-x-2 space-x-reverse">
          <Link to={`/invoices/${r.id}`} className="text-xs text-primary hover:underline">
            {ar.invoices.view}
          </Link>
          <a
            className="text-xs text-primary hover:underline"
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

      {isLoading ? (
        <p className="p-4 text-center text-muted-foreground">{ar.loading}</p>
      ) : (
        <ResponsiveTable
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.id)}
          onRowClick={(r) => { window.location.href = `/invoices/${r.id}`; }}
          empty={ar.invoices.empty}
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</Button>
          <span className="text-sm text-muted-foreground">صفحة {page} من {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>التالي</Button>
        </div>
      )}
    </>
  );
}

function OpenInvoicesTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['invoices', 'open-list'],
    queryFn: salesApi.listOpen,
  });
  const rows: OpenInvoiceRow[] = data ?? [];

  const columns: Column<OpenInvoiceRow>[] = [
    {
      key: 'no',
      header: ar.invoices.no,
      cell: (r) => (
        <Link to={`/invoices/${r.id}`} className="text-primary hover:underline font-mono text-xs">
          {r.invoice_no}
        </Link>
      ),
      primary: true,
    },
    { key: 'date', header: ar.invoices.date, cell: (r) => <span dir="ltr">{fmtDate(r.created_at)}</span>, secondary: true },
    { key: 'customer', header: ar.invoices.customer, cell: (r) => r.customer_name_ar, secondary: true },
    { key: 'total', header: ar.invoices.total, cell: (r) => <span className="font-medium" dir="ltr">{fmtMoney(r.total_egp)}</span> },
    { key: 'balance', header: ar.invoices.balance, cell: (r) => <span dir="ltr">{fmtMoney(r.balance_egp)}</span> },
    {
      key: 'age',
      header: ar.invoices.age,
      cell: (r) => {
        const stale = r.age_days >= STALE_DAYS_DEFAULT;
        return (
          <span>
            <span dir="ltr">{r.age_days}</span> {ar.invoices.days}
            {stale && (
              <span className="ms-2 inline-block px-2 py-0.5 rounded text-xs bg-yellow-200 text-yellow-900">
                {ar.invoices.staleBadge}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: ar.invoices.actions,
      cell: (r) => (
        <Link to={`/invoices/${r.id}`} className="text-xs text-primary hover:underline">
          {ar.invoices.view}
        </Link>
      ),
      hideOnMobile: true,
    },
  ];

  if (isLoading) return <p className="p-4 text-center text-muted-foreground">{ar.loading}</p>;
  return (
    <ResponsiveTable
      columns={columns}
      rows={rows}
      rowKey={(r) => String(r.id)}
      onRowClick={(r) => { window.location.href = `/invoices/${r.id}`; }}
      empty={ar.invoices.empty}
      rowClassName={(r) => (r.age_days >= STALE_DAYS_DEFAULT ? 'bg-yellow-50' : '')}
    />
  );
}

function PendingPickupTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['invoices', 'pending-pickup'],
    queryFn: salesApi.listPendingPickup,
  });
  const rows: PendingPickupRow[] = data ?? [];

  const deliverMut = useMutation({
    mutationFn: (id: number) => salesApi.markDelivered(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); },
  });

  const columns: Column<PendingPickupRow>[] = [
    {
      key: 'no',
      header: ar.invoices.no,
      cell: (r) => (
        <Link to={`/invoices/${r.id}`} className="text-primary hover:underline font-mono text-xs">
          {r.invoice_no}
        </Link>
      ),
      primary: true,
    },
    { key: 'date', header: ar.invoices.date, cell: (r) => <span dir="ltr">{fmtDate(r.created_at)}</span>, secondary: true },
    { key: 'customer', header: ar.invoices.customer, cell: (r) => r.customer_name_ar, secondary: true },
    { key: 'phone', header: ar.customers.phone, cell: (r) => <span dir="ltr">{r.customer_phone}</span> },
    { key: 'total', header: ar.invoices.total, cell: (r) => <span className="font-medium" dir="ltr">{fmtMoney(r.total_egp)}</span> },
  ];

  if (isLoading) return <p className="p-4 text-center text-muted-foreground">{ar.loading}</p>;
  return (
    <ResponsiveTable
      columns={columns}
      rows={rows}
      rowKey={(r) => String(r.id)}
      empty={ar.invoices.empty}
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
