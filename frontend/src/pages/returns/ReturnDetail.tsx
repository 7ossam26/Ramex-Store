import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { returnsApi } from '@/lib/returns-api';
import type { ReturnDetail } from '@/lib/returns-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
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

export function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const idNum = Number(id);

  const { data, isLoading } = useQuery<ReturnDetail>({
    queryKey: ['return', idNum],
    queryFn: () => returnsApi.get(idNum),
  });

  if (isLoading || !data) {
    return <p className="text-center text-foreground-muted p-8">{ar.loading}</p>;
  }
  const ret = data;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <PageHeader
        title={ret.return_no}
        description={`${fmtDate(ret.processed_at)} · ${ar.returns.actor}: ${ret.actor_username}`}
        backTo="/returns"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill tone={ret.kind === 'refund' ? 'danger' : 'info'}>
              {ret.kind === 'refund' ? ar.returns.kinds.refund : ar.returns.kinds.exchange}
            </StatusPill>
            <Button asChild variant="outline" size="sm">
              <a href={returnsApi.slipPdfUrl(ret.id)} target="_blank" rel="noreferrer">
                {ar.returns.slipPdf}
              </a>
            </Button>
          </div>
        }
      />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        {/* Main column — lines + customer + meta */}
        <div className="space-y-4 min-w-0">
          {/* Customer */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{ar.returns.customer}</CardTitle>
            </CardHeader>
            <CardContent>
              <Link to={`/customers/${ret.customer_id}`} className="text-accent hover:text-accent-hover hover:underline underline-offset-2 font-medium">
                {ret.customer_name_ar}
              </Link>
              <p className="text-sm text-foreground-muted">{ret.customer_phone} · {ret.customer_code}</p>
            </CardContent>
          </Card>

          {/* Lines */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{ar.returns.returnLines}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-start text-xs text-foreground-muted uppercase tracking-wide border-b border-border-subtle">
                    <tr>
                      <th className="px-3 py-3 font-medium">الخامة / اللون</th>
                      <th className="px-3 py-3 font-medium">كود التوب</th>
                      <th className="px-3 py-3 font-medium">الوزن</th>
                      <th className="px-3 py-3 font-medium">{ar.returns.disposition}</th>
                      <th className="px-3 py-3 font-medium">{ar.returns.refundAmount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ret.lines.map((l) => (
                      <tr key={l.id} className="border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150">
                        <td className="px-3 py-2.5 text-foreground">{l.fabric_name_ar} / {l.color_name_ar}</td>
                        <td className="px-3 py-2.5 font-mono text-xs tabular-num" dir="ltr">
                          {l.roll_sr_no ?? l.internal_barcode}
                        </td>
                        <td className="px-3 py-2.5 tabular-num" dir="ltr">{Number(l.weight_kg).toFixed(3)}</td>
                        <td className="px-3 py-2.5">
                          <StatusPill tone={l.roll_disposition === 'back_to_stock' ? 'success' : 'danger'}>
                            {l.roll_disposition === 'back_to_stock'
                              ? ar.returns.dispositions.back_to_stock
                              : ar.returns.dispositions.damaged}
                          </StatusPill>
                        </td>
                        <td className="px-3 py-2.5 font-medium tabular-num" dir="ltr">{fmtMoney(l.refund_amount_egp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {ret.notes_ar && (
            <Card>
              <CardContent className="p-4 text-sm">
                <span className="font-medium text-foreground">{ar.returns.notes}: </span>
                <span className="text-foreground-muted">{ret.notes_ar}</span>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Summary column — sticky on desktop */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-lg border border-border-subtle bg-surface-elevated p-5 space-y-4 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">المبالغ</h2>

            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-foreground-muted">{ar.returns.originalInvoice}</dt>
                <dd className="mt-0.5">
                  <Link to={`/invoices/${ret.original_invoice_id}`} className="text-accent hover:text-accent-hover hover:underline underline-offset-2 font-mono tabular-num">
                    {ret.original_invoice_no}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-foreground-muted">{ar.returns.refundMethod}</dt>
                <dd className="mt-0.5 text-foreground">{ar.returns.refundMethods[ret.refund_method]}</dd>
              </div>
              {ret.exchange_new_invoice_id && (
                <div>
                  <dt className="text-xs text-foreground-muted">{ar.returns.exchangeNewInvoice}</dt>
                  <dd className="mt-0.5">
                    <Link to={`/invoices/${ret.exchange_new_invoice_id}`} className="text-accent hover:text-accent-hover hover:underline underline-offset-2 font-mono tabular-num">
                      #{ret.exchange_new_invoice_id}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>

            <div className="pt-3 border-t border-border-subtle">
              <p className="text-xs text-foreground-muted">{ar.returns.totalRefund}</p>
              <p className="text-2xl font-semibold text-foreground tabular-num mt-0.5" dir="ltr">
                {fmtMoney(ret.total_refund_egp)} <span className="text-sm text-foreground-tertiary font-normal">ج.م</span>
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
