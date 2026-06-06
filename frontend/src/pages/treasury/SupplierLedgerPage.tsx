import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { suppliersApi, type SupplierInvoice, type SupplierPayment } from '@/lib/suppliers-api';
import { bankAccountsApi } from '@/lib/settings-api';
import { Button } from '@/components/ui/button';
import { PageShell, SectionCard } from '@/components/Layout/PageShell';
import { StatusPill } from '@/components/StatusPill';
import { ErrorBanner } from '@/components/ErrorBanner';
import { cn } from '@/lib/utils';
import { extractApiError } from '@/lib/api-error';
import { format } from 'date-fns';

function fmt(v: string | number) {
  return Number(v).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Record Payment Dialog ─────────────────────────────────────────────────────

function RecordPaymentDialog({
  supplierId,
  supplierName,
  onClose,
  onDone,
}: {
  supplierId: number;
  supplierName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'instapay' | 'bank_transfer'>('cash');
  const [bankAccountId, setBankAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: banks = [] } = useQuery({ queryKey: ['bank-accounts'], queryFn: bankAccountsApi.list });

  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () =>
      suppliersApi.recordPayment({
        supplier_id: supplierId,
        amount_egp: Number(amount),
        method,
        bank_account_id: method !== 'cash' ? Number(bankAccountId) : null,
        notes_ar: notes.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-ledger', supplierId] });
      qc.invalidateQueries({ queryKey: ['suppliers-list'] });
      onDone();
    },
    onError: (e) => setError(extractApiError(e)),
  });

  const needsBank = method !== 'cash';
  const canSubmit = Number(amount) > 0 && (!needsBank || !!bankAccountId);
  const inputCls = 'h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div dir="rtl" role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-border-subtle bg-surface-elevated shadow-xl">
          <header className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
            <h2 className="text-base font-semibold text-foreground">{ar.supplierPayables.recordPaymentTitle} — {supplierName}</h2>
            <button type="button" onClick={onClose} className="size-8 flex items-center justify-center rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-hover cursor-pointer">✕</button>
          </header>
          <div className="p-5 space-y-4">
            {error && <ErrorBanner title={ar.common.error} description={error} />}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{ar.supplierPayables.amount}</label>
              <input type="number" min={1} step={1} className={cn(inputCls, 'w-44')} style={{ unicodeBidi: 'plaintext' }} placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => e.target.select()} />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{ar.supplierPayables.paymentMethod}</label>
              <div className="flex gap-2">
                {(['cash', 'instapay', 'bank_transfer'] as const).map((m) => (
                  <button key={m} type="button"
                    onClick={() => { setMethod(m); setBankAccountId(''); }}
                    className={cn('h-8 px-3 rounded-md border text-xs transition-colors cursor-pointer',
                      method === m ? 'bg-accent text-foreground-on-accent border-accent font-medium' : 'bg-surface text-foreground-muted border-border-subtle hover:bg-surface-hover hover:text-foreground')}>
                    {ar.supplierPayables.method[m]}
                  </button>
                ))}
              </div>
            </div>

            {needsBank && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{ar.supplierPayables.bankAccount}</label>
                <select className={inputCls} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                  <option value="">— اختر حساباً —</option>
                  {banks.filter((b) => b.is_active).map((b) => (
                    <option key={b.id} value={b.id}>{b.name_ar} {b.bank_name_ar ? `/ ${b.bank_name_ar}` : ''}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{ar.supplierPayables.notes}</label>
              <input className={inputCls} dir="rtl" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending || !canSubmit} className="min-w-28">
                {mut.isPending ? ar.loading : ar.supplierPayables.recordPayment}
              </Button>
              <Button size="sm" variant="outline" onClick={onClose}>{ar.common.cancel}</Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function SupplierLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const supplierId = Number(id);
  const [showPayment, setShowPayment] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['supplier-ledger', supplierId],
    queryFn: () => suppliersApi.getLedger(supplierId),
    enabled: !!supplierId,
  });

  const supplierName = data?.invoices[0]?.supplier_name ?? data?.payments[0]?.supplier_name ?? `مورد #${supplierId}`;
  const balance = data?.balance;

  // Merge invoices + payments into a single chronological ledger
  type LedgerRow = { date: string; kind: 'invoice' | 'payment'; row: SupplierInvoice | SupplierPayment };
  const entries: LedgerRow[] = [
    ...(data?.invoices ?? []).map((inv) => ({ date: inv.invoice_date, kind: 'invoice' as const, row: inv })),
    ...(data?.payments ?? []).map((p) => ({ date: p.paid_at, kind: 'payment' as const, row: p })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <PageShell
      title={supplierName}
      description={ar.supplierPayables.title}
      backTo="/treasury/suppliers"
      actions={
        <Button size="sm" onClick={() => setShowPayment(true)}>
          {ar.supplierPayables.recordPayment}
        </Button>
      }
    >
      {/* Balance KPIs */}
      {balance && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: ar.supplierPayables.totalInvoiced, value: balance.total_invoiced_egp, tone: 'neutral' as const },
            { label: ar.supplierPayables.totalPaid, value: balance.total_paid_egp, tone: 'success' as const },
            { label: ar.supplierPayables.balance, value: balance.balance_egp, tone: balance.balance_egp > 0 ? 'danger' as const : 'success' as const },
          ].map(({ label, value, tone }) => (
            <div key={label} className="rounded-lg border border-border-subtle bg-surface-elevated p-3 space-y-1">
              <p className="text-xs text-foreground-muted">{label}</p>
              <p className={cn('text-lg font-bold tabular-num', tone === 'danger' ? 'text-danger-foreground' : tone === 'success' ? 'text-success-foreground' : 'text-foreground')} dir="ltr">
                {fmt(value)}
              </p>
              <p className="text-xs text-foreground-muted">ج.م</p>
            </div>
          ))}
        </div>
      )}

      {/* Combined ledger */}
      <SectionCard noPadding>
        {isLoading ? (
          <div className="p-6 text-center text-sm text-foreground-muted">{ar.loading}</div>
        ) : error ? (
          <div className="p-4"><ErrorBanner title={ar.common.error} description={extractApiError(error)} onRetry={() => refetch()} /></div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-center text-sm text-foreground-muted">لا توجد حركات</div>
        ) : (
          <table className="w-full text-sm" dir="rtl">
            <thead className="bg-surface-row-alt text-foreground-muted border-b border-border-subtle">
              <tr>
                <th className="py-2.5 px-4 text-start font-medium">التاريخ</th>
                <th className="py-2.5 px-4 text-start font-medium">النوع</th>
                <th className="py-2.5 px-4 text-start font-medium">تفاصيل</th>
                <th className="py-2.5 px-4 text-end font-medium">{ar.supplierPayables.amount}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle bg-surface-elevated">
              {entries.map(({ kind, row }) => {
                const isInvoice = kind === 'invoice';
                const inv = row as SupplierInvoice;
                const pmt = row as SupplierPayment;
                return (
                  <tr key={`${kind}-${row.id}`} className="hover:bg-surface-hover/50 transition-colors">
                    <td className="py-2.5 px-4 text-foreground-muted tabular-num text-xs">
                      {isInvoice
                        ? inv.invoice_date
                        : format(new Date(pmt.paid_at), 'yyyy-MM-dd')}
                    </td>
                    <td className="py-2.5 px-4">
                      <StatusPill tone={isInvoice ? 'danger' : 'success'}>
                        {isInvoice ? ar.supplierPayables.invoices : ar.supplierPayables.payments}
                      </StatusPill>
                    </td>
                    <td className="py-2.5 px-4 text-foreground-muted text-xs max-w-48">
                      {isInvoice ? (
                        <>
                          {inv.invoice_no && <span className="font-mono ml-1" dir="ltr">{inv.invoice_no}</span>}
                          {inv.source === 'shipment_receive' && inv.source_ref && (
                            <span className="text-foreground-muted"> · {ar.supplierPayables.shipmentRef} #{inv.source_ref}</span>
                          )}
                          {inv.notes_ar && <span> · {inv.notes_ar}</span>}
                        </>
                      ) : (
                        <>
                          {ar.supplierPayables.method[pmt.method]}
                          {pmt.bank_name_ar && <span> · {pmt.bank_name_ar}</span>}
                          {pmt.notes_ar && <span> · {pmt.notes_ar}</span>}
                        </>
                      )}
                    </td>
                    <td className={cn('py-2.5 px-4 text-end tabular-num font-semibold', isInvoice ? 'text-danger-foreground' : 'text-success-foreground')} dir="ltr">
                      {isInvoice ? '+' : '−'} {fmt(row.amount_egp)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </SectionCard>

      {showPayment && (
        <RecordPaymentDialog
          supplierId={supplierId}
          supplierName={supplierName}
          onClose={() => setShowPayment(false)}
          onDone={() => setShowPayment(false)}
        />
      )}
    </PageShell>
  );
}
