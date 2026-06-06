import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ar } from '@/i18n/ar';
import { suppliersApi, type SupplierWithBalance } from '@/lib/suppliers-api';
import { bankAccountsApi } from '@/lib/settings-api';
import { codesApi } from '@/lib/codes-api';
import { Button } from '@/components/ui/button';
import { PageShell, SectionCard } from '@/components/Layout/PageShell';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { ErrorBanner } from '@/components/ErrorBanner';
import { cn } from '@/lib/utils';
import { extractApiError } from '@/lib/api-error';
import { format } from 'date-fns';

function fmt(v: number) {
  return v.toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Add Debt Dialog ──────────────────────────────────────────────────────────

function AddDebtDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: supplierData } = useQuery({
    queryKey: ['codes-suppliers'],
    queryFn: codesApi.listSuppliers,
  });
  const suppliers = supplierData ?? [];

  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () =>
      suppliersApi.createInvoice({
        supplier_id: Number(supplierId),
        invoice_no: invoiceNo.trim() || null,
        invoice_date: invoiceDate,
        amount_egp: Number(amount),
        notes_ar: notes.trim() || null,
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers-list'] }); onDone(); },
    onError: (e) => setError(extractApiError(e)),
  });

  const canSubmit = !!supplierId && Number(amount) > 0 && !!invoiceDate;

  const inputCls = 'h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div dir="rtl" role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-border-subtle bg-surface-elevated shadow-xl">
          <header className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
            <h2 className="text-base font-semibold text-foreground">{ar.supplierPayables.addDebtTitle}</h2>
            <button type="button" onClick={onClose} className="size-8 flex items-center justify-center rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-hover cursor-pointer">✕</button>
          </header>
          <div className="p-5 space-y-4">
            {error && <ErrorBanner title={ar.common.error} description={error} />}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{ar.supplierPayables.suppliersHub}</label>
              <select className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— اختر مورداً —</option>
                {suppliers.filter((s: { is_active: boolean }) => s.is_active).map((s: { id: number; arabic_name: string }) => (
                  <option key={s.id} value={s.id}>{s.arabic_name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{ar.supplierPayables.invoiceDate}</label>
                <input type="date" className={inputCls} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{ar.supplierPayables.invoiceNo} <span className="text-foreground-muted text-xs">(اختياري)</span></label>
                <input className={inputCls} dir="ltr" placeholder="INV-001" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{ar.supplierPayables.amount}</label>
              <input type="number" min={1} step={1} className={cn(inputCls, 'w-44')} style={{ unicodeBidi: 'plaintext' }} placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} onFocus={(e) => e.target.select()} />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{ar.supplierPayables.notes}</label>
              <input className={inputCls} dir="rtl" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending || !canSubmit} className="min-w-28">
                {mut.isPending ? ar.loading : ar.common.save}
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

export function SuppliersListPage() {
  const navigate = useNavigate();
  const [showAddDebt, setShowAddDebt] = useState(false);

  const { data: suppliers = [], isLoading, error, refetch } = useQuery<SupplierWithBalance[]>({
    queryKey: ['suppliers-list'],
    queryFn: suppliersApi.list,
  });

  const totalBalance = suppliers.reduce((s, r) => s + r.balance_egp, 0);

  const columns: Column<SupplierWithBalance>[] = [
    {
      key: 'name',
      header: 'اسم المورد',
      primary: true,
      cell: (r) => <span className="font-medium text-foreground">{r.arabic_name}</span>,
    },
    {
      key: 'invoiced',
      header: `${ar.supplierPayables.totalInvoiced} (ج.م)`,
      align: 'end',
      secondary: true,
      cell: (r) => (
        <span className="tabular-num text-foreground-muted" dir="ltr">
          {r.total_invoiced_egp > 0 ? fmt(r.total_invoiced_egp) : '—'}
        </span>
      ),
    },
    {
      key: 'paid',
      header: `${ar.supplierPayables.totalPaid} (ج.م)`,
      align: 'end',
      secondary: true,
      cell: (r) => (
        <span className="tabular-num text-foreground-muted" dir="ltr">
          {r.total_paid_egp > 0 ? fmt(r.total_paid_egp) : '—'}
        </span>
      ),
    },
    {
      key: 'balance',
      header: `${ar.supplierPayables.balance} (ج.م)`,
      align: 'end',
      cell: (r) => (
        <span className={cn('tabular-num font-semibold', r.balance_egp > 0 ? 'text-danger-foreground' : 'text-foreground-muted')} dir="ltr">
          {r.balance_egp > 0 ? fmt(r.balance_egp) : ar.supplierPayables.zeroBalance}
        </span>
      ),
    },
  ];

  return (
    <PageShell
      title={ar.supplierPayables.title}
      description={ar.hubs.supplierPayablesDesc}
      backTo="/treasury"
      actions={
        <div className="flex items-center gap-2">
          {!isLoading && totalBalance > 0 && (
            <span className="text-sm text-foreground-muted tabular-num">
              إجمالي الديون:{' '}
              <span className="font-semibold text-danger-foreground">{fmt(totalBalance)} ج.م</span>
            </span>
          )}
          <Button size="sm" onClick={() => setShowAddDebt(true)}>{ar.supplierPayables.addDebt}</Button>
        </div>
      }
    >
      <SectionCard noPadding>
        <ResponsiveTable<SupplierWithBalance>
          columns={columns}
          rows={suppliers}
          rowKey={(r) => String(r.id)}
          onRowClick={(r) => navigate(`/treasury/suppliers/${r.id}`)}
          isLoading={isLoading}
          isError={!!error}
          onRetry={() => refetch()}
          errorTitle={ar.common.error}
          empty="لا توجد موردين مسجلين"
        />
      </SectionCard>

      {showAddDebt && (
        <AddDebtDialog onClose={() => setShowAddDebt(false)} onDone={() => setShowAddDebt(false)} />
      )}
    </PageShell>
  );
}
