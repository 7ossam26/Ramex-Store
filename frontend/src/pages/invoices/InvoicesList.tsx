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

export function InvoicesListPage() {
  const [tab, setTab] = useState<TabKey>('all');

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">{ar.invoices.title}</h1>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {(['all', 'open', 'pending_pickup', 'completed', 'cancelled'] as TabKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
              tab === k
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {ar.invoices.tabs[k]}
          </button>
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

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>{ar.invoices.filterDateFrom}</Label>
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label>{ar.invoices.filterDateTo}</Label>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} dir="ltr" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-center text-muted-foreground">{ar.loading}</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-center text-muted-foreground">{ar.invoices.empty}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-right text-xs text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-3 py-2">{ar.invoices.no}</th>
                  <th className="px-3 py-2">{ar.invoices.date}</th>
                  <th className="px-3 py-2">{ar.invoices.customer}</th>
                  <th className="px-3 py-2">{ar.invoices.total}</th>
                  <th className="px-3 py-2">{ar.invoices.paid}</th>
                  <th className="px-3 py-2">{ar.invoices.balance}</th>
                  <th className="px-3 py-2">{ar.invoices.status}</th>
                  <th className="px-3 py-2">{ar.invoices.actions}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link to={`/invoices/${r.id}`} className="text-primary hover:underline">
                        {r.invoice_no}
                      </Link>
                    </td>
                    <td className="px-3 py-2" dir="ltr">{fmtDate(r.created_at)}</td>
                    <td className="px-3 py-2">{r.customer_name_ar}</td>
                    <td className="px-3 py-2 font-medium" dir="ltr">{fmtMoney(r.total_egp)}</td>
                    <td className="px-3 py-2" dir="ltr">{fmtMoney(r.paid_egp)}</td>
                    <td className="px-3 py-2" dir="ltr">{fmtMoney(r.balance_egp)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs ${STATUS_COLORS[r.status]}`}>
                        {ar.invoices.statuses[r.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 space-x-1 space-x-reverse">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

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

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="p-4 text-center text-muted-foreground">{ar.loading}</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-center text-muted-foreground">{ar.invoices.empty}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-right text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="px-3 py-2">{ar.invoices.no}</th>
                <th className="px-3 py-2">{ar.invoices.date}</th>
                <th className="px-3 py-2">{ar.invoices.customer}</th>
                <th className="px-3 py-2">{ar.invoices.total}</th>
                <th className="px-3 py-2">{ar.invoices.balance}</th>
                <th className="px-3 py-2">{ar.invoices.age}</th>
                <th className="px-3 py-2">{ar.invoices.actions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const stale = r.age_days >= STALE_DAYS_DEFAULT;
                return (
                  <tr
                    key={r.id}
                    className={`border-t border-border hover:bg-muted/40 ${stale ? 'bg-yellow-50' : ''}`}
                  >
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link to={`/invoices/${r.id}`} className="text-primary hover:underline">
                        {r.invoice_no}
                      </Link>
                    </td>
                    <td className="px-3 py-2" dir="ltr">{fmtDate(r.created_at)}</td>
                    <td className="px-3 py-2">{r.customer_name_ar}</td>
                    <td className="px-3 py-2 font-medium" dir="ltr">{fmtMoney(r.total_egp)}</td>
                    <td className="px-3 py-2" dir="ltr">{fmtMoney(r.balance_egp)}</td>
                    <td className="px-3 py-2">
                      <span dir="ltr">{r.age_days}</span> {ar.invoices.days}
                      {stale && (
                        <span className="ms-2 inline-block px-2 py-0.5 rounded text-xs bg-yellow-200 text-yellow-900">
                          {ar.invoices.staleBadge}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Link to={`/invoices/${r.id}`} className="text-xs text-primary hover:underline">
                        {ar.invoices.view}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <p className="p-4 text-center text-muted-foreground">{ar.loading}</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-center text-muted-foreground">{ar.invoices.empty}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-right text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="px-3 py-2">{ar.invoices.no}</th>
                <th className="px-3 py-2">{ar.invoices.date}</th>
                <th className="px-3 py-2">{ar.invoices.customer}</th>
                <th className="px-3 py-2">{ar.customers.phone}</th>
                <th className="px-3 py-2">{ar.invoices.total}</th>
                <th className="px-3 py-2">{ar.invoices.actions}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link to={`/invoices/${r.id}`} className="text-primary hover:underline">
                      {r.invoice_no}
                    </Link>
                  </td>
                  <td className="px-3 py-2" dir="ltr">{fmtDate(r.created_at)}</td>
                  <td className="px-3 py-2">{r.customer_name_ar}</td>
                  <td className="px-3 py-2" dir="ltr">{r.customer_phone}</td>
                  <td className="px-3 py-2 font-medium" dir="ltr">{fmtMoney(r.total_egp)}</td>
                  <td className="px-3 py-2">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
