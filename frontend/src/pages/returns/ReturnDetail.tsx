import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { returnsApi } from '@/lib/returns-api';
import type { ReturnDetail } from '@/lib/returns-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const idNum = Number(id);

  const { data, isLoading } = useQuery<ReturnDetail>({
    queryKey: ['return', idNum],
    queryFn: () => returnsApi.get(idNum),
  });

  if (isLoading || !data) {
    return <p className="text-center text-muted-foreground p-8">{ar.loading}</p>;
  }
  const ret = data;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold font-mono" dir="ltr">{ret.return_no}</h1>
          <p className="text-sm text-muted-foreground">
            {fmtDate(ret.processed_at)} · {ar.returns.actor}: {ret.actor_username}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <span className={`px-2 py-1 rounded text-xs ${ret.kind === 'refund' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
            {ret.kind === 'refund' ? ar.returns.kinds.refund : ar.returns.kinds.exchange}
          </span>
          <Button asChild variant="outline" size="sm">
            <a href={returnsApi.slipPdfUrl(ret.id)} target="_blank" rel="noreferrer">
              {ar.returns.slipPdf}
            </a>
          </Button>
        </div>
      </div>

      {/* Meta */}
      <Card>
        <CardContent className="p-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">{ar.returns.originalInvoice}: </span>
            <Link to={`/invoices/${ret.original_invoice_id}`} className="text-primary hover:underline font-mono">
              {ret.original_invoice_no}
            </Link>
          </div>
          <div>
            <span className="text-muted-foreground">{ar.returns.refundMethod}: </span>
            {ar.returns.refundMethods[ret.refund_method]}
          </div>
          {ret.exchange_new_invoice_id && (
            <div>
              <span className="text-muted-foreground">{ar.returns.exchangeNewInvoice}: </span>
              <Link to={`/invoices/${ret.exchange_new_invoice_id}`} className="text-primary hover:underline font-mono">
                #{ret.exchange_new_invoice_id}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customer */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{ar.returns.customer}</CardTitle>
        </CardHeader>
        <CardContent>
          <Link to={`/customers/${ret.customer_id}`} className="text-primary hover:underline font-medium">
            {ret.customer_name_ar}
          </Link>
          <p className="text-sm text-muted-foreground">{ret.customer_phone} · {ret.customer_code}</p>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{ar.returns.returnLines}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-right text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="px-3 py-2">الخامة / اللون</th>
                <th className="px-3 py-2">كود التوب</th>
                <th className="px-3 py-2">الوزن</th>
                <th className="px-3 py-2">{ar.returns.disposition}</th>
                <th className="px-3 py-2">{ar.returns.refundAmount}</th>
              </tr>
            </thead>
            <tbody>
              {ret.lines.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-3 py-2">{l.fabric_name_ar} / {l.color_name_ar}</td>
                  <td className="px-3 py-2 font-mono text-xs" dir="ltr">
                    {l.roll_sr_no ?? l.internal_barcode}
                  </td>
                  <td className="px-3 py-2" dir="ltr">{Number(l.weight_kg).toFixed(3)}</td>
                  <td className="px-3 py-2">
                    {l.roll_disposition === 'back_to_stock'
                      ? ar.returns.dispositions.back_to_stock
                      : ar.returns.dispositions.damaged}
                  </td>
                  <td className="px-3 py-2 font-medium" dir="ltr">{fmtMoney(l.refund_amount_egp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Total */}
      <Card>
        <CardContent className="p-3">
          <div className="flex justify-between text-base font-bold">
            <span>{ar.returns.totalRefund} (ج.م)</span>
            <span dir="ltr">{fmtMoney(ret.total_refund_egp)}</span>
          </div>
        </CardContent>
      </Card>

      {ret.notes_ar && (
        <Card>
          <CardContent className="p-3 text-sm">
            <span className="font-medium">{ar.returns.notes}: </span>{ret.notes_ar}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
