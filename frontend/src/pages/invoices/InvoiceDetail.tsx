import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { extractApiError } from '@/lib/api-error';
import { salesApi } from '@/lib/sales-api';
import { returnsApi } from '@/lib/returns-api';
import { useAuth } from '@/lib/auth';
import { isOwnerOrAbove } from '@/lib/roles';
import type {
  AddOpenInvoiceLinesBody,
  BankAccount,
  CancelOpenInvoiceBody,
  DepositHandling,
  DepositRefundBody,
  FinalPaymentBody,
  FulfillmentDestination,
  InvoiceDetail,
  InvoiceLineDetail,
  InvoiceStatusHistoryEntry,
  PaymentMethod,
  RollLookup,
  SaleLineInput,
} from '@/lib/sales-types';
import type { RefundMethod, RollDisposition, ReturnLineInput } from '@/lib/returns-types';
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
} from '@/components/ResponsiveDialog';
import { PageHeader } from '@/components/PageHeader';
import { InvoiceStatusPill } from '@/components/invoices/InvoiceStatusPill';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Skeleton } from '@/components/Skeleton';
import { ConfirmDialog } from '@/components/ConfirmDialog';

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

function parseAmount(s: string): number {
  if (!s) return 0;
  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const idNum = Number(id);
  const qc = useQueryClient();
  const { user } = useAuth();
  const isOwner = isOwnerOrAbove(user?.role);

  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidResult, setVoidResult] = useState<string | null>(null);

  const [finalPayOpen, setFinalPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [deliverConfirmOpen, setDeliverConfirmOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [addLinesOpen, setAddLinesOpen] = useState(false);

  const invoiceQ = useQuery<InvoiceDetail>({
    queryKey: ['invoice', idNum],
    queryFn: () => salesApi.get(idNum),
  });
  const { data, isLoading, isError } = invoiceQ;

  const history = useQuery<InvoiceStatusHistoryEntry[]>({
    queryKey: ['invoice', idNum, 'history'],
    queryFn: () => salesApi.statusHistory(idNum),
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
      setVoidResult(extractApiError(e));
    },
  });

  const deliverMut = useMutation({
    mutationFn: () => salesApi.markDelivered(idNum),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', idNum] });
      qc.invalidateQueries({ queryKey: ['invoice', idNum, 'history'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-4" aria-hidden>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <ErrorBanner
        title="تعذر تحميل تفاصيل الفاتورة"
        onRetry={() => invoiceQ.refetch()}
      />
    );
  }
  const inv = data;

  const canVoid = inv.status === 'completed';
  const canAddFinal =
    inv.status === 'open' && Number(inv.total_egp) > Number(inv.paid_egp);
  const canDeliver = inv.status === 'closed_pending_pickup';
  const canCancelOpen = inv.status === 'open' || inv.status === 'closed_pending_pickup';
  const canReturn = inv.status === 'completed';
  // v2 Phase 5: refund the over-deposit only on still-open invoices that have
  // more paid than they're worth. Once `deposit_refunded`, further refunds /
  // line edits are blocked.
  const overDeposit = Number(inv.paid_egp) - Number(inv.total_egp);
  const canRefundDeposit = inv.status === 'open' && overDeposit > 0.001;
  // v2 Phase 5: attach rolls to a still-open invoice (covers the
  // reopen-and-add-lines path after a no-lines deposit).
  const canAddLines = inv.status === 'open';

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <PageHeader
        title={inv.invoice_no}
        description={`${fmtDate(inv.created_at)} · ${ar.invoices.cashier}: ${inv.cashier_username}`}
        backTo="/invoices"
        actions={
          <div className="flex items-center gap-2 flex-wrap [&_button]:print:hidden [&_a]:print:hidden">
            <InvoiceStatusPill status={inv.status} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/invoices/${idNum}/draft`, '_blank', 'noopener')}
            >
              {ar.invoices.pdfDownload}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/invoices/${idNum}/draft?variant=reprint`, '_blank', 'noopener')}
            >
              {ar.invoices.reprint}
            </Button>
            {canAddFinal && (
              <Button size="sm" onClick={() => setFinalPayOpen(true)}>
                {ar.invoices.addFinalPayment}
              </Button>
            )}
            {canRefundDeposit && (
              <Button size="sm" onClick={() => setRefundOpen(true)}>
                {ar.invoices.refundDeposit}
              </Button>
            )}
            {canAddLines && (
              <Button variant="outline" size="sm" onClick={() => setAddLinesOpen(true)}>
                {ar.invoices.addLines}
              </Button>
            )}
            {canDeliver && (
              <Button
                size="sm"
                onClick={() => setDeliverConfirmOpen(true)}
                disabled={deliverMut.isPending}
              >
                {ar.invoices.markDelivered}
              </Button>
            )}
            {canCancelOpen && (
              <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)}>
                {ar.invoices.cancelOpenInvoice}
              </Button>
            )}
            {canVoid && (
              <Button variant="outline" size="sm" onClick={() => setVoidOpen(true)}>
                {ar.invoices.voidAction}
              </Button>
            )}
            {canReturn && (
              <Button size="sm" onClick={() => setReturnOpen(true)}>
                {ar.returns.processReturn}
              </Button>
            )}
          </div>
        }
      />

      {/* Customer */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{ar.invoices.customer}</CardTitle>
        </CardHeader>
        <CardContent>
          <Link to={`/customers/${inv.customer_id}`} className="text-accent hover:text-accent-hover hover:underline underline-offset-2 font-medium">
            {inv.customer_name_ar}
          </Link>
          <p className="text-sm text-foreground-muted">{inv.customer_phone} · {inv.customer_code}</p>
          {inv.customer_address_ar && <p className="text-sm text-foreground">{inv.customer_address_ar}</p>}
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{ar.invoices.detailLines}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-start text-xs text-foreground-muted uppercase tracking-wide border-b border-border-subtle">
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
                <tr key={l.id} className="border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150">
                  <td className="px-3 py-2.5 text-foreground">{l.fabric_name_ar} / {l.color_name_ar}</td>
                  <td className="rmx-print-code px-3 py-2.5 font-mono text-xs tabular-num" dir="ltr">{l.roll_sr_no ?? l.internal_barcode}</td>
                  <td className="px-3 py-2.5 tabular-num" dir="ltr">{Number(l.weight_kg).toFixed(3)}</td>
                  <td className="px-3 py-2.5 tabular-num" dir="ltr">{fmtMoney(l.selling_price_egp)}</td>
                  <td className="px-3 py-2.5 tabular-num" dir="ltr">{fmtMoney(l.line_discount_egp)}</td>
                  <td className="px-3 py-2.5 font-medium tabular-num" dir="ltr">{fmtMoney(l.line_total_egp)}</td>
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
                <thead className="text-start text-xs text-foreground-muted uppercase tracking-wide border-b border-border-subtle">
                  <tr>
                    <th className="px-3 py-2">التاريخ</th>
                    <th className="px-3 py-2">طريقة</th>
                    <th className="px-3 py-2">نوع</th>
                    <th className="px-3 py-2">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.payments.map((p) => (
                    <tr key={p.id} className="border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150">
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

      {/* Status history */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{ar.invoices.statusHistory}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {history.isLoading ? (
            <p className="p-4 text-center text-muted-foreground text-sm">{ar.loading}</p>
          ) : !history.data || history.data.length === 0 ? (
            <p className="p-4 text-center text-muted-foreground text-sm">{ar.invoices.statusHistoryEmpty}</p>
          ) : (
            <ul className="divide-y divide-border">
              {history.data.map((h) => (
                <li key={h.id} className="px-3 py-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span>
                      {h.from_status ? labelStatus(h.from_status) : '—'}
                      {' '}→{' '}
                      <span className="font-medium">{labelStatus(h.to_status)}</span>
                    </span>
                    <span className="text-xs text-muted-foreground" dir="ltr">{fmtDate(h.created_at)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {ar.invoices.actor}: {h.actor_username ?? '—'}
                    {h.notes_ar && <> · {h.notes_ar}</>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Final payment dialog */}
      {canAddFinal && (
        <FinalPaymentDialog
          open={finalPayOpen}
          onOpenChange={setFinalPayOpen}
          invoiceId={inv.id}
          balance={Number(inv.balance_egp)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['invoice', inv.id] });
            qc.invalidateQueries({ queryKey: ['invoice', inv.id, 'history'] });
            qc.invalidateQueries({ queryKey: ['invoices'] });
          }}
        />
      )}

      {/* Cancel open invoice dialog */}
      {canCancelOpen && (
        <CancelOpenDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          invoiceId={inv.id}
          paid={Number(inv.paid_egp)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['invoice', inv.id] });
            qc.invalidateQueries({ queryKey: ['invoice', inv.id, 'history'] });
            qc.invalidateQueries({ queryKey: ['invoices'] });
          }}
        />
      )}

      {/* Return / exchange dialog */}
      {canReturn && (
        <ReturnModal
          open={returnOpen}
          onOpenChange={setReturnOpen}
          invoice={inv}
          isOwner={isOwner}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['invoice', inv.id] });
            qc.invalidateQueries({ queryKey: ['invoices'] });
          }}
        />
      )}

      {/* Void dialog (completed only) */}
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
            {voidResult && <p className="text-sm text-warning-foreground" role="alert">{voidResult}</p>}
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

      <ConfirmDialog
        open={deliverConfirmOpen}
        message={ar.invoices.markDeliveredConfirm}
        onConfirm={() => { setDeliverConfirmOpen(false); deliverMut.mutate(); }}
        onCancel={() => setDeliverConfirmOpen(false)}
      />

      {canRefundDeposit && (
        <DepositRefundDialog
          open={refundOpen}
          onOpenChange={setRefundOpen}
          invoiceId={inv.id}
          maxAmount={overDeposit}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['invoice', inv.id] });
            qc.invalidateQueries({ queryKey: ['invoice', inv.id, 'history'] });
            qc.invalidateQueries({ queryKey: ['invoices'] });
          }}
        />
      )}

      {canAddLines && (
        <AddLinesDialog
          open={addLinesOpen}
          onOpenChange={setAddLinesOpen}
          invoice={inv}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['invoice', inv.id] });
            qc.invalidateQueries({ queryKey: ['invoice', inv.id, 'history'] });
            qc.invalidateQueries({ queryKey: ['invoices'] });
          }}
        />
      )}
    </div>
  );
}

function labelStatus(s: string): string {
  const known = ar.invoices.statuses as Record<string, string>;
  return known[s] ?? s;
}

function FinalPaymentDialog({
  open,
  onOpenChange,
  invoiceId,
  balance,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoiceId: number;
  balance: number;
  onSuccess: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod | 'both'>('cash');
  const [cashAmount, setCashAmount] = useState(String(balance.toFixed(2)));
  const [instaAmount, setInstaAmount] = useState('');
  const [bankAccountId, setBankAccountId] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);

  const banks = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: salesApi.bankAccounts,
    enabled: open && method !== 'cash',
  });

  const mut = useMutation({
    mutationFn: (body: FinalPaymentBody) => salesApi.addFinalPayment(invoiceId, body),
    onSuccess: () => {
      onSuccess();
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      setError(extractApiError(e));
    },
  });

  function submit() {
    setError(null);
    const payments: FinalPaymentBody['payments'] = [];
    if (method === 'cash') {
      payments.push({ method: 'cash', amount: parseAmount(cashAmount) });
    } else if (method === 'instapay') {
      payments.push({
        method: 'instapay',
        amount: parseAmount(cashAmount),
        bankAccountId: bankAccountId === '' ? null : Number(bankAccountId),
      });
    } else {
      const cashV = parseAmount(cashAmount);
      const instaV = parseAmount(instaAmount);
      if (cashV > 0) payments.push({ method: 'cash', amount: cashV });
      if (instaV > 0) {
        payments.push({
          method: 'instapay',
          amount: instaV,
          bankAccountId: bankAccountId === '' ? null : Number(bankAccountId),
        });
      }
    }
    if (payments.length === 0) {
      setError(ar.common.error);
      return;
    }
    mut.mutate({ payments });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ar.invoices.finalPaymentTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm">
            {ar.pos.balance}: <span className="font-medium" dir="ltr">{balance.toFixed(2)}</span>
          </div>
          <div className="space-y-1">
            <Label>{ar.pos.paymentMethod}</Label>
            <select
              className="h-9 w-full border border-border-default rounded-md px-3 bg-surface-elevated text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod | 'both')}
            >
              <option value="cash">{ar.pos.cash}</option>
              <option value="instapay">{ar.pos.instapay}</option>
              <option value="both">{ar.pos.both}</option>
            </select>
          </div>
          {method === 'both' ? (
            <>
              <div className="space-y-1">
                <Label>{ar.pos.cashAmount}</Label>
                <Input value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} dir="ltr" inputMode="decimal" />
              </div>
              <div className="space-y-1">
                <Label>{ar.pos.instapayAmount}</Label>
                <Input value={instaAmount} onChange={(e) => setInstaAmount(e.target.value)} dir="ltr" inputMode="decimal" />
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <Label>{method === 'cash' ? ar.pos.cashAmount : ar.pos.instapayAmount}</Label>
              <Input value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} dir="ltr" inputMode="decimal" />
            </div>
          )}
          {method !== 'cash' && (
            <div className="space-y-1">
              <Label>{ar.pos.bankAccount}</Label>
              <select
                className="h-9 w-full border border-border-default rounded-md px-3 bg-surface-elevated text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75"
                value={bankAccountId === '' ? '' : String(bankAccountId)}
                onChange={(e) => setBankAccountId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <option value="">—</option>
                {(banks.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>{b.name_ar}</option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="text-sm text-danger transition-opacity duration-75 ease-standard" role="alert">{error}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <DialogClose asChild>
              <Button variant="outline">{ar.common.cancel}</Button>
            </DialogClose>
            <Button onClick={submit} disabled={mut.isPending}>
              {ar.common.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CancelOpenDialog({
  open,
  onOpenChange,
  invoiceId,
  paid,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoiceId: number;
  paid: number;
  onSuccess: () => void;
}) {
  const [handling, setHandling] = useState<DepositHandling>('full_refund');
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('cash');
  const [partialAmount, setPartialAmount] = useState('');
  const [bankAccountId, setBankAccountId] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const showBankPicker = handling !== 'keep_as_credit' && refundMethod === 'instapay';

  const banks = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: salesApi.bankAccounts,
    enabled: open && showBankPicker,
  });

  const mut = useMutation({
    mutationFn: (body: CancelOpenInvoiceBody) => salesApi.cancelOpenInvoice(invoiceId, body),
    onSuccess: () => {
      onSuccess();
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      setError(extractApiError(e));
    },
  });

  function submit() {
    setError(null);
    if (!notes.trim()) {
      setError(ar.invoices.cancelReason);
      return;
    }
    const body: CancelOpenInvoiceBody = {
      deposit_handling: handling,
      notes_ar: notes,
      refund_method: handling === 'keep_as_credit' ? null : refundMethod,
      partial_refund_amount: handling === 'partial_refund' ? parseAmount(partialAmount) : null,
      bank_account_id: showBankPicker && bankAccountId !== '' ? Number(bankAccountId) : null,
    };
    mut.mutate(body);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ar.invoices.cancelOpenInvoiceTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm">
            {ar.pos.paid}: <span className="font-medium" dir="ltr">{paid.toFixed(2)}</span>
          </div>
          <div className="space-y-1">
            <Label>{ar.invoices.depositHandling}</Label>
            <select
              className="h-9 w-full border border-border-default rounded-md px-3 bg-surface-elevated text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75"
              value={handling}
              onChange={(e) => setHandling(e.target.value as DepositHandling)}
            >
              <option value="full_refund">{ar.invoices.depositHandlingOptions.full_refund}</option>
              <option value="partial_refund">{ar.invoices.depositHandlingOptions.partial_refund}</option>
              <option value="keep_as_credit">{ar.invoices.depositHandlingOptions.keep_as_credit}</option>
            </select>
          </div>
          {handling === 'partial_refund' && (
            <div className="space-y-1">
              <Label>{ar.invoices.partialRefundAmount}</Label>
              <Input
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                dir="ltr"
                inputMode="decimal"
              />
            </div>
          )}
          {handling !== 'keep_as_credit' && (
            <div className="space-y-1">
              <Label>{ar.invoices.refundMethod}</Label>
              <select
                className="h-9 w-full border border-border-default rounded-md px-3 bg-surface-elevated text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75"
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}
              >
                <option value="cash">{ar.pos.cash}</option>
                <option value="instapay">{ar.pos.instapay}</option>
              </select>
            </div>
          )}
          {showBankPicker && (
            <div className="space-y-1">
              <Label>{ar.pos.bankAccount}</Label>
              <select
                className="h-9 w-full border border-border-default rounded-md px-3 bg-surface-elevated text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75"
                value={bankAccountId === '' ? '' : String(bankAccountId)}
                onChange={(e) => setBankAccountId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <option value="">—</option>
                {(banks.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>{b.name_ar}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label>{ar.invoices.cancelReason}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} dir="rtl" />
          </div>
          {error && <p className="text-sm text-danger transition-opacity duration-75 ease-standard" role="alert">{error}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <DialogClose asChild>
              <Button variant="outline">{ar.common.cancel}</Button>
            </DialogClose>
            <Button onClick={submit} disabled={mut.isPending}>
              {ar.invoices.cancelOpenInvoice}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * v2 Phase 5 — refund the over-deposit portion of an open invoice. Method
 * picker mirrors POS: only `cash` and `instapay` are wired today; Phase 7
 * unlocks `bank_transfer` and `cheque`.
 */
function DepositRefundDialog({
  open,
  onOpenChange,
  invoiceId,
  maxAmount,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoiceId: number;
  maxAmount: number;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState(maxAmount.toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [bankAccountId, setBankAccountId] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(maxAmount.toFixed(2));
      setMethod('cash');
      setBankAccountId('');
      setError(null);
    }
  }, [open, maxAmount]);

  const banks = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: salesApi.bankAccounts,
    enabled: open && method === 'instapay',
  });

  const mut = useMutation({
    mutationFn: (body: DepositRefundBody) => salesApi.depositRefund(invoiceId, body),
    onSuccess: () => {
      onSuccess();
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      setError(extractApiError(e));
    },
  });

  function submit() {
    setError(null);
    const v = parseAmount(amount);
    if (v <= 0) { setError(ar.common.error); return; }
    if (v > maxAmount + 0.01) {
      setError(`${ar.invoices.refundDepositMaxHint}: ${maxAmount.toFixed(2)}`);
      return;
    }
    mut.mutate({
      amountEgp: v,
      method,
      bankAccountId:
        method === 'instapay' && bankAccountId !== '' ? Number(bankAccountId) : null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ar.invoices.refundDepositTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border-subtle bg-surface-row-alt p-2 text-sm flex justify-between">
            <span className="text-foreground-muted">{ar.invoices.refundDepositMaxHint}:</span>
            <span className="font-medium tabular-num text-foreground" dir="ltr">
              {maxAmount.toFixed(2)}
            </span>
          </div>
          <div className="space-y-1">
            <Label>{ar.invoices.refundDepositAmount}</Label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              dir="ltr"
              inputMode="decimal"
              className="h-11 tabular-num"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label>{ar.invoices.refundMethod}</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['cash', 'instapay'] as const).map((m) => {
                const active = method === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`cursor-pointer rounded-md border-2 p-2 text-sm font-medium transition-colors duration-150 min-h-11 ${
                      active
                        ? 'border-accent bg-accent-subtle text-accent'
                        : 'border-border-subtle bg-surface-elevated text-foreground hover:bg-surface-hover'
                    }`}
                  >
                    {ar.pos[m]}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {(['bank_transfer', 'cheque'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled
                  className="cursor-not-allowed rounded-md border border-dashed border-border-subtle bg-surface-row-alt p-2 text-xs text-foreground-tertiary leading-tight min-h-11"
                  title={ar.invoices.methodComingPhase7}
                >
                  {m === 'bank_transfer' ? 'تحويل بنكي' : 'شيك'}
                  <span className="block text-[10px]">{ar.invoices.methodComingPhase7}</span>
                </button>
              ))}
            </div>
          </div>
          {method === 'instapay' && (
            <div className="space-y-1">
              <Label>{ar.pos.bankAccount}</Label>
              <select
                className="h-11 w-full border border-border-default rounded-md px-3 bg-surface-elevated text-foreground"
                value={bankAccountId === '' ? '' : String(bankAccountId)}
                onChange={(e) =>
                  setBankAccountId(e.target.value === '' ? '' : Number(e.target.value))
                }
              >
                <option value="">—</option>
                {(banks.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>{b.name_ar}</option>
                ))}
              </select>
            </div>
          )}
          {error && (
            <p
              className="text-sm text-danger-foreground bg-danger-subtle border border-danger/30 rounded-md p-2"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button variant="outline" className="h-11 cursor-pointer">
                {ar.common.cancel}
              </Button>
            </DialogClose>
            <Button
              onClick={submit}
              disabled={mut.isPending}
              className="h-11 cursor-pointer"
            >
              {ar.invoices.refundDepositConfirm}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * v2 Phase 5 — attach rolls to a still-open invoice. Mirrors the POS cart
 * row UX (reference + per-unit final price) but lives on InvoiceDetail so
 * the cashier can extend a no-lines deposit without a separate POS session.
 *
 * On submit, calls POST /api/invoices/:id/lines which recomputes total/balance
 * from sum(lines) − paid_egp. When balance lands at 0 the invoice closes; if
 * paid still exceeds total, the cashier uses «استرجاع الدفعة» to refund.
 */
type StagedLine = {
  roll: RollLookup;
  perUnit: string;
};

function fmtPerUnit(roll: RollLookup): string {
  return roll.fabric_unit === 'meter' ? ar.pos.finalPricePerMeter : ar.pos.finalPricePerKg;
}

function rollQty(roll: RollLookup): number {
  if (roll.fabric_unit === 'meter') {
    return roll.length_m == null ? 0 : Number(roll.length_m);
  }
  return Number(roll.weight_kg);
}

function lineTotal(line: StagedLine): number {
  const perUnit = Number(line.perUnit);
  if (!Number.isFinite(perUnit) || perUnit <= 0) return 0;
  return perUnit * rollQty(line.roll);
}

function AddLinesDialog({
  open,
  onOpenChange,
  invoice,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice: InvoiceDetail;
  onSuccess: () => void;
}) {
  const [scanInput, setScanInput] = useState('');
  const [lines, setLines] = useState<StagedLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setScanInput('');
      setLines([]);
      setError(null);
    }
  }, [open]);

  const destination: FulfillmentDestination =
    (invoice.fulfillment_destination as FulfillmentDestination) ?? 'shop';
  const existingRollIds = new Set(invoice.lines.map((l) => l.roll_id));

  async function tryAddByBarcode(barcode: string) {
    setError(null);
    const trimmed = barcode.trim();
    if (!trimmed) return;
    try {
      const roll = await salesApi.rollByBarcode(trimmed);
      if (roll.status !== 'in_stock') { setError(ar.pos.notFound); return; }
      if (!roll.is_visible_at_pos) { setError(ar.pos.notVisible); return; }
      if (existingRollIds.has(roll.id) || lines.some((l) => l.roll.id === roll.id)) {
        setError(ar.invoices.rollAlreadyInInvoice);
        return;
      }
      const matchesDestination =
        destination === 'factory_direct'
          ? roll.warehouse === 'factory'
          : roll.warehouse === 'shop' || roll.warehouse === 'damaged_shop';
      if (!matchesDestination) { setError(ar.invoices.rollWrongDestination); return; }
      setLines((prev) => [...prev, { roll, perUnit: '' }]);
      setScanInput('');
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setError(status === 404 ? ar.pos.notFound : extractApiError(e));
    }
  }

  const total = lines.reduce((s, l) => s + lineTotal(l), 0);

  const mut = useMutation({
    mutationFn: (body: AddOpenInvoiceLinesBody) => salesApi.addOpenInvoiceLines(invoice.id, body),
    onSuccess: () => { onSuccess(); onOpenChange(false); },
    onError: (e: unknown) => {
      setError(extractApiError(e));
    },
  });

  function submit() {
    setError(null);
    if (lines.length === 0) { setError(ar.invoices.addLinesNoSelections); return; }
    if (lines.some((l) => Number(l.perUnit) <= 0)) {
      setError(ar.pos.finalPriceRequired);
      return;
    }
    const body: AddOpenInvoiceLinesBody = {
      lines: lines.map((l): SaleLineInput => ({
        rollId: l.roll.id,
        finalPricePerUnit: Number(l.perUnit),
      })),
    };
    mut.mutate(body);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ar.invoices.addLinesTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border-subtle bg-surface-row-alt p-2 text-sm flex justify-between gap-2 flex-wrap">
            <span>
              <span className="text-foreground-muted">{ar.invoices.depositSnapshot}:</span>{' '}
              <span className="font-medium tabular-num text-foreground" dir="ltr">
                {Number(invoice.paid_egp).toFixed(2)}
              </span>
            </span>
            <span>
              <span className="text-foreground-muted">{ar.pos.fulfillment}:</span>{' '}
              <span className="font-medium text-foreground">
                {destination === 'factory_direct'
                  ? ar.invoices.fulfillmentFactoryDirect
                  : ar.invoices.fulfillmentShop}
              </span>
            </span>
          </div>

          <div className="space-y-1">
            <Label>{ar.invoices.addLinesScanPlaceholder}</Label>
            <Input
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void tryAddByBarcode(scanInput);
                }
              }}
              dir="ltr"
              autoFocus
              className="h-11"
            />
          </div>

          {lines.length === 0 ? (
            <p className="text-sm text-foreground-tertiary text-center py-6">
              {ar.invoices.addLinesNoSelections}
            </p>
          ) : (
            <div className="border border-border-subtle rounded-md divide-y divide-border-subtle">
              {lines.map((l, idx) => {
                const qty = rollQty(l.roll);
                const ref = l.roll.reference_price_per_unit;
                const unitLabel = l.roll.fabric_unit === 'meter' ? ar.pos.quantityM : ar.pos.quantityKg;
                return (
                  <div key={l.roll.id} className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <div className="font-medium text-sm text-foreground">
                          {l.roll.fabric_name_ar}
                          {l.roll.color_name_ar ? ` / ${l.roll.color_name_ar}` : ''}
                        </div>
                        <div className="text-xs font-mono tabular-num text-foreground-tertiary" dir="ltr">
                          {l.roll.roll_sr_no ?? l.roll.internal_barcode} · {qty.toFixed(3)} {unitLabel}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="cursor-pointer h-8 px-2 text-foreground-tertiary hover:text-danger"
                        onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}
                      >
                        ✕
                      </Button>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-foreground-muted">
                      <span>
                        {ar.pos.referencePrice}{' '}
                        <span className="text-foreground-tertiary">({unitLabel})</span>
                      </span>
                      <span className="tabular-num text-foreground" dir="ltr">
                        {ref != null && Number(ref) > 0 ? Number(ref).toFixed(2) : ar.pos.referenceUnset}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">{fmtPerUnit(l.roll)}</Label>
                        <Input
                          value={l.perUnit}
                          onChange={(e) =>
                            setLines((ls) =>
                              ls.map((s, i) => (i === idx ? { ...s, perUnit: e.target.value } : s)),
                            )
                          }
                          dir="ltr"
                          inputMode="decimal"
                          className="h-9 tabular-num"
                        />
                      </div>
                      <div className="text-end">
                        <Label className="text-xs">{ar.pos.lineTotal}</Label>
                        <div className="h-9 flex items-center justify-end font-semibold text-foreground tabular-num" dir="ltr">
                          {lineTotal(l).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {lines.length > 0 && (
            <div className="flex justify-between text-sm font-medium border-t border-border-subtle pt-2">
              <span className="text-foreground-muted">{ar.invoices.addLinesSummary}</span>
              <span className="tabular-num text-foreground" dir="ltr">{total.toFixed(2)}</span>
            </div>
          )}

          {error && (
            <p
              className="text-sm text-danger-foreground bg-danger-subtle border border-danger/30 rounded-md p-2"
              role="alert"
            >
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button variant="outline" className="h-11 cursor-pointer">{ar.common.cancel}</Button>
            </DialogClose>
            <Button
              onClick={submit}
              disabled={mut.isPending || lines.length === 0}
              className="h-11 cursor-pointer"
            >
              {ar.invoices.addLinesSubmit}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold text-base border-t border-border-subtle pt-2 mt-2 text-foreground' : 'text-foreground-muted'}`}>
      <span>{label}</span>
      <span className="tabular-num text-foreground" dir="ltr">{value}</span>
    </div>
  );
}

type LineState = {
  checked: boolean;
  refundAmount: string;
  disposition: RollDisposition;
};

function ReturnModal({
  open,
  onOpenChange,
  invoice,
  isOwner,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice: InvoiceDetail;
  isOwner: boolean;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<'refund' | 'exchange'>('refund');
  const [lineStates, setLineStates] = useState<Record<number, LineState>>(() => {
    const init: Record<number, LineState> = {};
    for (const l of invoice.lines) {
      init[l.id] = {
        checked: false,
        refundAmount: Number(l.line_total_egp).toFixed(2),
        disposition: 'back_to_stock',
      };
    }
    return init;
  });
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('cash');
  const [bankAccountId, setBankAccountId] = useState<number | ''>('');
  const [notesAr, setNotesAr] = useState('');
  const [ownerOverride, setOwnerOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const banks = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: salesApi.bankAccounts,
    enabled: open && refundMethod === 'instapay',
  });

  const returnMut = useMutation({
    mutationFn: () => {
      const selectedLines = invoice.lines
        .filter((l) => lineStates[l.id]?.checked)
        .map((l): ReturnLineInput => ({
          originalLineId: l.id,
          rollId: l.roll_id,
          refundAmountEgp: parseAmount(lineStates[l.id]!.refundAmount),
          disposition: lineStates[l.id]!.disposition,
        }));
      if (selectedLines.length === 0) throw new Error('NO_LINES');
      return returnsApi.processReturn({
        originalInvoiceId: invoice.id,
        lines: selectedLines,
        refundMethod,
        bankAccountId: bankAccountId === '' ? null : Number(bankAccountId),
        notesAr: notesAr || null,
        ownerWindowOverride: ownerOverride,
      });
    },
    onSuccess: () => {
      onSuccess();
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      setError(extractApiError(e));
    },
  });

  function updateLine(id: number, patch: Partial<LineState>) {
    setLineStates((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));
  }

  const checkedCount = Object.values(lineStates).filter((s) => s.checked).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setError(null); setMode('refund'); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'refund' ? ar.returns.processReturnTitle : ar.returns.processExchangeTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mode === 'refund' ? 'default' : 'outline'}
              onClick={() => setMode('refund')}
            >
              {ar.returns.kinds.refund}
            </Button>
            <Button
              size="sm"
              variant={mode === 'exchange' ? 'default' : 'outline'}
              onClick={() => setMode('exchange')}
            >
              {ar.returns.kinds.exchange}
            </Button>
          </div>

          {/* Line selection */}
          <div>
            <p className="text-sm font-medium mb-2">{ar.returns.returnLines}</p>
            <div className="border border-border-subtle rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-start text-xs text-foreground-muted bg-surface-hover/50 uppercase tracking-wide">
                  <tr>
                    <th className="px-2 py-2 font-medium">✓</th>
                    <th className="px-2 py-2 font-medium">الخامة / اللون</th>
                    <th className="px-2 py-2 font-medium">الوزن</th>
                    <th className="px-2 py-2 font-medium">{ar.returns.refundAmount}</th>
                    <th className="px-2 py-2 font-medium">{ar.returns.disposition}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((l: InvoiceLineDetail) => {
                    const s = lineStates[l.id]!;
                    return (
                      <tr key={l.id} className="border-t border-border-subtle hover:bg-surface-hover transition-colors duration-150">
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={s.checked}
                            onChange={(e) => updateLine(l.id, { checked: e.target.checked })}
                            className="accent-accent cursor-pointer"
                          />
                        </td>
                        <td className="px-2 py-2 text-foreground">{l.fabric_name_ar} / {l.color_name_ar}</td>
                        <td className="px-2 py-2 tabular-num" dir="ltr">{Number(l.weight_kg).toFixed(3)}</td>
                        <td className="px-2 py-2">
                          <input
                            type="number" inputMode="numeric"
                            className="h-8 w-24 border border-border-default rounded-md px-2 text-sm bg-surface-elevated text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75 disabled:opacity-50"
                            value={s.refundAmount}
                            disabled={!s.checked}
                            onChange={(e) => updateLine(l.id, { refundAmount: e.target.value })}
                            dir="ltr"
                            min="0"
                            step="1"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            className="h-8 border border-border-default rounded-md px-2 text-sm bg-surface-elevated text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75 disabled:opacity-50"
                            value={s.disposition}
                            disabled={!s.checked}
                            onChange={(e) => updateLine(l.id, { disposition: e.target.value as RollDisposition })}
                          >
                            <option value="back_to_stock">{ar.returns.dispositions.back_to_stock}</option>
                            <option value="damaged">{ar.returns.dispositions.damaged}</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Refund method */}
          <div className="space-y-1">
            <Label>{ar.returns.refundMethod}</Label>
            <select
              className="h-9 w-full border border-border-default rounded-md px-3 bg-surface-elevated text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75"
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value as RefundMethod)}
            >
              <option value="cash">{ar.returns.refundMethods.cash}</option>
              <option value="instapay">{ar.returns.refundMethods.instapay}</option>
              <option value="customer_credit">{ar.returns.refundMethods.customer_credit}</option>
            </select>
          </div>

          {refundMethod === 'instapay' && (
            <div className="space-y-1">
              <Label>{ar.pos.bankAccount}</Label>
              <select
                className="h-9 w-full border border-border-default rounded-md px-3 bg-surface-elevated text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75"
                value={bankAccountId === '' ? '' : String(bankAccountId)}
                onChange={(e) => setBankAccountId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <option value="">—</option>
                {(banks.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>{b.name_ar}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <Label>{ar.returns.notes}</Label>
            <input
              className="h-10 w-full border border-border-default rounded-md px-3 text-sm bg-surface-elevated text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75"
              value={notesAr}
              onChange={(e) => setNotesAr(e.target.value)}
              dir="rtl"
            />
          </div>

          {/* Owner override for expired window */}
          {isOwner && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={ownerOverride}
                onChange={(e) => setOwnerOverride(e.target.checked)}
              />
              {ar.returns.ownerOverride}
            </label>
          )}

          {mode === 'exchange' && (
            <div className="rounded-md border border-warning/30 bg-warning-subtle p-3 text-sm text-warning-foreground">
              بعد تسجيل الإرجاع سيتم فتح فاتورة جديدة تلقائياً من نقطة البيع — أكمل عملية الاستبدال من شاشة POS.
            </div>
          )}

          {error && <p className="text-sm text-danger transition-opacity duration-75 ease-standard" role="alert">{error}</p>}

          <div className="flex gap-2 justify-end pt-2">
            <DialogClose asChild>
              <Button variant="outline">{ar.common.cancel}</Button>
            </DialogClose>
            <Button
              onClick={() => { setError(null); returnMut.mutate(); }}
              disabled={checkedCount === 0 || returnMut.isPending}
            >
              {returnMut.isPending ? ar.loading : ar.common.confirm}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
