import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { ar } from '@/i18n/ar';
import { salesApi } from '@/lib/sales-api';
import { useAuth } from '@/lib/auth';
import type { InvoiceDetail, InvoiceStatus } from '@/lib/sales-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  open: 'bg-amber-100 text-amber-800',
  closed_pending_pickup: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

function fmtMoney(s: string | number): string {
  return Number(s).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', {
    timeZone: 'Africa/Cairo', day: '2-digit', month: '2-digit', year: 'numeric',
  }) + ' ' + d.toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const idNum = Number(id);
  const qc = useQueryClient();
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';

  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidResult, setVoidResult] = useState<string | null>(null);

  const { data, isLoading } = useQuery<InvoiceDetail>({
    queryKey: ['invoice', idNum],
    queryFn: () => salesApi.get(idNum),
  });

  const voidMut = useMutation({
    mutationFn: () => salesApi.voidInvoice(idNum, voidReason, isOwner),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['invoice', idNum] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      if (res.requires_approval) {
        setVoidResult(ar.invoices.requiresApproval);
      } else {
        setVoidOpen(false);
        setVoidResult(null);
      }
    },
    onError: (e: unknown) => {
      const data = axios.isAxiosError(e) ? (e.response?.data as { message?: string } | undefined) : undefined;
      setVoidResult(data?.message ?? ar.common.error);
    },
  });

  if (isLoading || !data) {
    return <p className="text-center text-muted-foreground p-8">{ar.loading}</p>;
  }
  const inv = data;
  const variant: 'original' | 'reprint' | 'open' =
    inv.status === 'open' ? 'open' : 'original';

  const canVoid = inv.status === 'completed' || inv.status === 'closed_pending_pickup';

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold font-mono">{inv.invoice_no}</h1>
          <p className="text-sm text-muted-foreground">{fmtDate(inv.created_at)} · {ar.invoices.cashier}: {inv.cashier_username}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-xs ${STATUS_COLORS[inv.status]}`}>
            {ar.invoices.statuses[inv.status]}
          </span>
          <Button asChild variant="outline" size="sm">
            <a href={salesApi.pdfUrl(inv.id, variant)} target="_blank" rel="noreferrer">
              {ar.invoices.pdfDownload}
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={salesApi.pdfUrl(inv.id, 'reprint')} target="_blank" rel="noreferrer">
              {ar.invoices.reprint}
            </a>
          </Button>
          {canVoid && (
            <Button variant="outline" size="sm" onClick={() => setVoidOpen(true)}>
              {ar.invoices.voidAction}
            </Button>
          )}
        </div>
      </div>

      {/* Customer */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{ar.invoices.customer}</CardTitle>
        </CardHeader>
        <CardContent>
          <Link to={`/customers/${inv.customer_id}`} className="text-primary hover:underline font-medium">
            {inv.customer_name_ar}
          </Link>
          <p className="text-sm text-muted-foreground">{inv.customer_phone} · {inv.customer_code}</p>
          {inv.customer_address_ar && <p className="text-sm">{inv.customer_address_ar}</p>}
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{ar.invoices.detailLines}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-right text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="px-3 py-2">الخامة / اللون</th>
                <th className="px-3 py-2">كود التوب</th>
                <th className="px-3 py-2">الوزن</th>
                <th className="px-3 py-2">السعر</th>
                <th className="px-3 py-2">الخصم</th>
                <th className="px-3 py-2">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-3 py-2">{l.fabric_name_ar} / {l.color_name_ar}</td>
                  <td className="px-3 py-2 font-mono text-xs" dir="ltr">{l.roll_sr_no ?? l.internal_barcode}</td>
                  <td className="px-3 py-2" dir="ltr">{Number(l.weight_kg).toFixed(3)}</td>
                  <td className="px-3 py-2" dir="ltr">{fmtMoney(l.selling_price_egp)}</td>
                  <td className="px-3 py-2" dir="ltr">{fmtMoney(l.line_discount_egp)}</td>
                  <td className="px-3 py-2 font-medium" dir="ltr">{fmtMoney(l.line_total_egp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Totals + Payments */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">المبالغ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <Row label={ar.pos.subtotal} value={fmtMoney(inv.subtotal_egp)} />
            {Number(inv.cart_discount_egp) > 0 && (
              <Row label={ar.pos.discount} value={`- ${fmtMoney(inv.cart_discount_egp)}`} />
            )}
            {Number(inv.tax_egp) > 0 && (
              <Row label={ar.pos.tax} value={fmtMoney(inv.tax_egp)} />
            )}
            {Number(inv.rounding_egp) !== 0 && (
              <Row label={ar.pos.rounding} value={fmtMoney(inv.rounding_egp)} />
            )}
            <Row label={ar.pos.total} value={fmtMoney(inv.total_egp)} bold />
            <Row label={ar.pos.paid} value={fmtMoney(inv.paid_egp)} />
            <Row label={ar.pos.balance} value={fmtMoney(inv.balance_egp)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{ar.invoices.detailPayments}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {inv.payments.length === 0 ? (
              <p className="p-4 text-center text-muted-foreground text-sm">{ar.common.none}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-right text-xs text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-3 py-2">التاريخ</th>
                    <th className="px-3 py-2">طريقة</th>
                    <th className="px-3 py-2">نوع</th>
                    <th className="px-3 py-2">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.payments.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-3 py-2" dir="ltr">{fmtDate(p.created_at)}</td>
                      <td className="px-3 py-2">{p.method === 'cash' ? ar.pos.cash : ar.pos.instapay}</td>
                      <td className="px-3 py-2 text-xs">{p.payment_kind}</td>
                      <td className="px-3 py-2 font-medium" dir="ltr">{fmtMoney(p.amount_egp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {inv.notes_ar && (
        <Card>
          <CardContent className="p-3 text-sm">
            <span className="font-medium">{ar.pos.notes}: </span>{inv.notes_ar}
          </CardContent>
        </Card>
      )}

      {/* Void dialog */}
      <Dialog open={voidOpen} onOpenChange={(o) => { setVoidOpen(o); if (!o) setVoidResult(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{ar.invoices.voidConfirm}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="space-y-1">
              <Label>{ar.invoices.voidReason}</Label>
              <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} dir="rtl" />
            </div>
            {voidResult && <p className="text-sm text-amber-700">{voidResult}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <DialogClose asChild>
                <Button variant="outline">{ar.common.cancel}</Button>
              </DialogClose>
              <Button onClick={() => voidMut.mutate()} disabled={!voidReason || voidMut.isPending}>
                {ar.invoices.voidAction}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold text-base border-t border-border pt-1 mt-1' : ''}`}>
      <span>{label}</span>
      <span dir="ltr">{value}</span>
    </div>
  );
}
