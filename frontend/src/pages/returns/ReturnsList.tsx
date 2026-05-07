import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { returnsApi } from '@/lib/returns-api';
import type { ReturnListRow } from '@/lib/returns-types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { MobileFilterSheet } from '@/components/MobileFilterSheet';

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

  const { data, isLoading } = useQuery<{ rows: ReturnListRow[]; total: number }>({
    queryKey: ['returns', dateFrom, dateTo, page],
    queryFn: () =>
      returnsApi.list({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        limit: 30,
      }),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 30));
  const activeFilters = (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  const columns: Column<ReturnListRow>[] = [
    {
      key: 'return_no',
      header: ar.returns.returnNo,
      cell: (r) => (
        <span className="font-mono text-xs" dir="ltr">{r.return_no}</span>
      ),
      primary: true,
    },
    {
      key: 'date',
      header: ar.returns.date,
      cell: (r) => <span className="text-xs" dir="ltr">{fmtDate(r.processed_at)}</span>,
      secondary: true,
    },
    {
      key: 'orig',
      header: ar.returns.originalInvoice,
      cell: (r) => (
        <Link
          to={`/invoices/${r.original_invoice_id}`}
          className="text-primary hover:underline font-mono text-xs"
        >
          {r.original_invoice_no}
        </Link>
      ),
    },
    { key: 'customer', header: ar.returns.customer, cell: (r) => r.customer_name_ar },
    {
      key: 'kind',
      header: ar.returns.kind,
      cell: (r) =>
        r.kind === 'refund' ? ar.returns.kinds.refund : ar.returns.kinds.exchange,
    },
    {
      key: 'total',
      header: ar.returns.totalRefund,
      cell: (r) => (
        <span className="font-medium" dir="ltr">{fmtMoney(r.total_refund_egp)}</span>
      ),
    },
    {
      key: 'method',
      header: ar.returns.refundMethod,
      cell: (r) => <span className="text-xs">{ar.returns.refundMethods[r.refund_method]}</span>,
    },
    {
      key: 'view',
      header: '',
      cell: (r) => (
        <Link to={`/returns/${r.id}`} className="text-primary hover:underline text-xs">
          {ar.invoices.view}
        </Link>
      ),
      align: 'end',
      hideOnMobile: true,
    },
  ];

  const filterControls = (
    <>
      <div className="space-y-1 flex-1 min-w-0">
        <label className="text-xs text-muted-foreground">{ar.invoices.filterDateFrom}</label>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="h-11 md:h-9 w-full md:w-36"
          dir="ltr"
        />
      </div>
      <div className="space-y-1 flex-1 min-w-0">
        <label className="text-xs text-muted-foreground">{ar.invoices.filterDateTo}</label>
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="h-11 md:h-9 w-full md:w-36"
          dir="ltr"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-11 md:h-9 self-stretch md:self-end"
        onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
      >
        {ar.common.refresh}
      </Button>
    </>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">{ar.returns.title}</h1>

      {/* Filters: inline ≥md, bottom sheet <md */}
      <MobileFilterSheet activeCount={activeFilters}>
        <Card>
          <CardContent className="p-3 flex flex-wrap md:flex-nowrap gap-3 items-end">
            {filterControls}
          </CardContent>
        </Card>
      </MobileFilterSheet>

      <div className="text-sm text-muted-foreground">
        {ar.returns.title} ({total})
      </div>

      {isLoading ? (
        <p className="p-6 text-center text-muted-foreground">{ar.loading}</p>
      ) : (
        <ResponsiveTable
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.id)}
          onRowClick={(r) => { window.location.href = `/returns/${r.id}`; }}
          empty={ar.returns.empty}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            السابق
          </Button>
          <span className="text-sm self-center" dir="ltr">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            التالي
          </Button>
        </div>
      )}
    </div>
  );
}
