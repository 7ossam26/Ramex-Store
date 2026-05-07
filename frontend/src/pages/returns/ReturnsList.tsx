import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { returnsApi } from '@/lib/returns-api';
import type { ReturnListRow } from '@/lib/returns-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">{ar.returns.title}</h1>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{ar.invoices.filterDateFrom}</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="h-8 w-36"
              dir="ltr"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">{ar.invoices.filterDateTo}</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="h-8 w-36"
              dir="ltr"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
          >
            {ar.common.refresh}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {ar.returns.title} ({total})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-center text-muted-foreground">{ar.loading}</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">{ar.returns.empty}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-right text-xs text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-3 py-2">{ar.returns.returnNo}</th>
                  <th className="px-3 py-2">{ar.returns.date}</th>
                  <th className="px-3 py-2">{ar.returns.originalInvoice}</th>
                  <th className="px-3 py-2">{ar.returns.customer}</th>
                  <th className="px-3 py-2">{ar.returns.kind}</th>
                  <th className="px-3 py-2">{ar.returns.totalRefund}</th>
                  <th className="px-3 py-2">{ar.returns.refundMethod}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                    <td className="px-3 py-2 font-mono text-xs" dir="ltr">{r.return_no}</td>
                    <td className="px-3 py-2 text-xs" dir="ltr">{fmtDate(r.processed_at)}</td>
                    <td className="px-3 py-2">
                      <Link
                        to={`/invoices/${r.original_invoice_id}`}
                        className="text-primary hover:underline font-mono text-xs"
                      >
                        {r.original_invoice_no}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{r.customer_name_ar}</td>
                    <td className="px-3 py-2">
                      {r.kind === 'refund' ? ar.returns.kinds.refund : ar.returns.kinds.exchange}
                    </td>
                    <td className="px-3 py-2 font-medium" dir="ltr">{fmtMoney(r.total_refund_egp)}</td>
                    <td className="px-3 py-2 text-xs">
                      {ar.returns.refundMethods[r.refund_method]}
                    </td>
                    <td className="px-3 py-2">
                      <Link to={`/returns/${r.id}`} className="text-primary hover:underline text-xs">
                        {ar.invoices.view}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
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
