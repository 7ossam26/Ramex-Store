import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Users } from 'lucide-react';
import { ar } from '@/i18n/ar';
import {
  suppliersApi,
  type SupplierWithBalance,
  type SupplierInvoice,
  type SupplierPayment,
} from '@/lib/suppliers-api';
import { bankAccountsApi } from '@/lib/settings-api';
import { codesApi } from '@/lib/codes-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ResponsiveDialog';
import { PageShell } from '@/components/Layout/PageShell';
import { ErrorBanner } from '@/components/ErrorBanner';
import { cn } from '@/lib/utils';
import { extractApiError } from '@/lib/api-error';
import { format } from 'date-fns';

function fmtAmount(v: string | number) {
  return Number(v).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const inputCls =
  'h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

// ─── Add Debt Dialog ──────────────────────────────────────────────────────────

function AddDebtDialog({
  supplierId,
  onClose,
  onDone,
}: {
  supplierId: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () =>
      suppliersApi.createInvoice({
        supplier_id: supplierId,
        invoice_date: date,
        amount_egp: Number(amount),
        notes_ar: notes.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-ledger', supplierId] });
      qc.invalidateQueries({ queryKey: ['suppliers-list'] });
      onDone();
    },
    onError: (e) => setError(extractApiError(e)),
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{ar.supplierPayables.addDebt}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && <ErrorBanner title={ar.common.error} description={error} />}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground">{ar.supplierPayables.amount}</Label>
            <input
              type="number"
              min={1}
              step={1}
              className={inputCls}
              style={{ unicodeBidi: 'plaintext' }}
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground">{ar.supplierPayables.invoiceDate}</Label>
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground">{ar.supplierPayables.notes}</Label>
            <Input dir="rtl" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <DialogClose asChild>
              <Button type="button" variant="outline">{ar.common.cancel}</Button>
            </DialogClose>
            <Button
              onClick={() => mut.mutate()}
              disabled={mut.isPending || Number(amount) <= 0 || !date}
            >
              {mut.isPending ? ar.loading : ar.common.save}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Record Payment Dialog ────────────────────────────────────────────────────

function RecordPaymentDialog({
  supplierId,
  onClose,
  onDone,
}: {
  supplierId: number;
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

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{ar.supplierPayables.recordPayment}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && <ErrorBanner title={ar.common.error} description={error} />}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground">{ar.supplierPayables.amount}</Label>
            <input
              type="number"
              min={1}
              step={1}
              className={cn(inputCls, 'w-44')}
              style={{ unicodeBidi: 'plaintext' }}
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground">{ar.supplierPayables.paymentMethod}</Label>
            <div className="flex gap-2">
              {(['cash', 'instapay', 'bank_transfer'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMethod(m); setBankAccountId(''); }}
                  className={cn(
                    'h-8 px-3 rounded-md border text-xs transition-colors cursor-pointer',
                    method === m
                      ? 'bg-accent text-foreground-on-accent border-accent font-medium'
                      : 'bg-surface text-foreground-muted border-border-subtle hover:bg-surface-hover hover:text-foreground',
                  )}
                >
                  {ar.supplierPayables.method[m]}
                </button>
              ))}
            </div>
          </div>
          {needsBank && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-foreground">{ar.supplierPayables.bankAccount}</Label>
              <select
                className={inputCls}
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
              >
                <option value="">— اختر حساباً —</option>
                {banks.filter((b) => b.is_active).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name_ar} {b.bank_name_ar ? `/ ${b.bank_name_ar}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-foreground">{ar.supplierPayables.notes}</Label>
            <Input dir="rtl" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <DialogClose asChild>
              <Button type="button" variant="outline">{ar.common.cancel}</Button>
            </DialogClose>
            <Button onClick={() => mut.mutate()} disabled={mut.isPending || !canSubmit}>
              {mut.isPending ? ar.loading : ar.supplierPayables.recordPayment}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type AddSupplierForm = { arabic_name: string; phone: string };

export function SuppliersPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAddDebt, setShowAddDebt] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [addSupplierError, setAddSupplierError] = useState<string | null>(null);

  const supplierForm = useForm<AddSupplierForm>({
    defaultValues: { arabic_name: '', phone: '' },
  });
  const qc = useQueryClient();

  const listQ = useQuery<SupplierWithBalance[]>({
    queryKey: ['suppliers-list'],
    queryFn: suppliersApi.list,
  });

  const ledgerQ = useQuery({
    queryKey: ['supplier-ledger', selectedId],
    queryFn: () => suppliersApi.getLedger(selectedId!),
    enabled: selectedId !== null,
  });

  const createSupplier = useMutation({
    mutationFn: (v: AddSupplierForm) =>
      codesApi.create('suppliers', {
        arabic_name: v.arabic_name.trim(),
        phone: v.phone.trim() || null,
      }),
    onSuccess: (data: unknown) => {
      qc.invalidateQueries({ queryKey: ['suppliers-list'] });
      qc.invalidateQueries({ queryKey: ['codes-suppliers'] });
      supplierForm.reset();
      setShowAddSupplier(false);
      setAddSupplierError(null);
      const id = (data as { id?: number })?.id;
      if (id) setSelectedId(id);
    },
    onError: (e) => setAddSupplierError(extractApiError(e)),
  });

  useEffect(() => {
    if (selectedId === null && listQ.data?.length) {
      setSelectedId(listQ.data[0].id);
    }
  }, [listQ.data, selectedId]);

  const suppliers = listQ.data ?? [];
  const selected = suppliers.find((s) => s.id === selectedId) ?? null;

  const invoices = ledgerQ.data?.invoices ?? [];
  const payments = ledgerQ.data?.payments ?? [];
  const entries = [
    ...invoices.map((r) => ({ date: r.invoice_date, kind: 'debt' as const, row: r as SupplierInvoice | SupplierPayment })),
    ...payments.map((r) => ({ date: r.paid_at, kind: 'payment' as const, row: r as SupplierInvoice | SupplierPayment })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const balance = ledgerQ.data?.balance.balance_egp ?? selected?.balance_egp ?? 0;

  return (
    <PageShell
      title={ar.supplierPayables.title}
      description={ar.hubs.supplierPayablesDesc}
      backTo="/treasury"
      actions={
        <Button
          size="sm"
          onClick={() => { setAddSupplierError(null); supplierForm.reset(); setShowAddSupplier(true); }}
        >
          {ar.supplierPayables.addSupplier}
        </Button>
      }
    >
      {/* flex-col on mobile, flex-row on md+. In RTL flex-row: first child = RIGHT, second = LEFT */}
      <div className="flex flex-col gap-4 md:flex-row">

        {/* RIGHT: supplier list sidebar */}
        <div className="md:w-72 w-full shrink-0 self-start rounded-xl border border-border-subtle bg-surface-elevated overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
            <Users className="size-4 text-foreground-muted" aria-hidden />
            <span className="text-sm font-semibold text-foreground">
              الموردين ({suppliers.length})
            </span>
          </div>
          <div className="overflow-y-auto md:max-h-[calc(100vh-220px)]">
            {listQ.isLoading ? (
              <p className="p-4 text-center text-sm text-foreground-muted">{ar.loading}</p>
            ) : suppliers.length === 0 ? (
              <p className="p-4 text-center text-sm text-foreground-muted">لا يوجد موردين</p>
            ) : (
              suppliers.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    'w-full px-4 py-3 border-b border-border-subtle last:border-0 cursor-pointer',
                    'hover:bg-surface-hover transition-colors text-start',
                    selectedId === s.id && 'bg-surface-row-alt',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="shrink-0">
                      <p className={cn(
                        'text-sm font-semibold tabular-num',
                        s.balance_egp > 0 ? 'text-danger-foreground' : 'text-success-foreground',
                      )}>
                        {s.balance_egp > 0 ? `${fmtAmount(s.balance_egp)} ج.م` : 'EGP 0.00'}
                      </p>
                      <p className="text-xs text-foreground-muted mt-0.5">
                        {s.balance_egp > 0 ? 'مستحق' : 'مسدد'}
                      </p>
                    </div>
                    <div className="text-end truncate">
                      <p className="text-sm font-medium text-foreground">{s.arabic_name}</p>
                      {s.phone && (
                        <p className="text-xs text-foreground-muted tabular-num mt-0.5" dir="ltr">{s.phone}</p>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* LEFT: detail panel */}
        <div className="flex-1 min-w-0 space-y-4">
          {!selected ? (
            <div className="rounded-xl border border-border-subtle bg-surface-elevated p-10 text-center text-sm text-foreground-muted">
              اختر مورداً من القائمة
            </div>
          ) : (
            <>
              {/* Supplier header */}
              <div className="rounded-xl border border-border-subtle bg-surface-elevated p-4 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-0.5">
                    <p className="text-xs text-foreground-muted">الرصيد المستحق</p>
                    <p className={cn(
                      'text-2xl font-bold tabular-num',
                      balance > 0 ? 'text-danger-foreground' : 'text-success-foreground',
                    )}>
                      {fmtAmount(balance)}{' '}
                      <span className="text-sm font-normal text-foreground-muted">ج.م</span>
                    </p>
                  </div>
                  <p className="text-lg font-semibold text-foreground">{selected.arabic_name}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setShowPayment(true)} className="w-full">
                    {ar.supplierPayables.recordPayment}
                  </Button>
                  <Button onClick={() => setShowAddDebt(true)} className="w-full">
                    {ar.supplierPayables.addDebt}
                  </Button>
                </div>
              </div>

              {/* Transaction history */}
              <div className="rounded-xl border border-border-subtle bg-surface-elevated overflow-hidden">
                <div className="px-4 py-3 border-b border-border-subtle">
                  <span className="text-sm font-semibold text-foreground">
                    سجل الحركات ({entries.length})
                  </span>
                </div>
                {ledgerQ.isLoading ? (
                  <p className="p-4 text-center text-sm text-foreground-muted">{ar.loading}</p>
                ) : entries.length === 0 ? (
                  <p className="p-6 text-center text-sm text-foreground-muted">لا يوجد حركات مسجلة</p>
                ) : (
                  <table className="w-full text-sm" dir="rtl">
                    <thead className="bg-surface-row-alt text-foreground-muted border-b border-border-subtle">
                      <tr>
                        <th className="py-2.5 px-4 text-start font-medium">التاريخ</th>
                        <th className="py-2.5 px-4 text-start font-medium">النوع</th>
                        <th className="py-2.5 px-4 text-start font-medium">ملاحظات</th>
                        <th className="py-2.5 px-4 text-end font-medium">المبلغ (ج.م)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle bg-surface-elevated">
                      {entries.map(({ kind, row }) => {
                        const isDebt = kind === 'debt';
                        const inv = row as SupplierInvoice;
                        const pmt = row as SupplierPayment;
                        return (
                          <tr key={`${kind}-${row.id}`} className="hover:bg-surface-hover/50 transition-colors">
                            <td className="py-2.5 px-4 text-foreground-muted tabular-num text-xs">
                              {isDebt
                                ? inv.invoice_date
                                : format(new Date(pmt.paid_at), 'yyyy-MM-dd')}
                            </td>
                            <td className="py-2.5 px-4">
                              <span className={cn(
                                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                                isDebt
                                  ? 'bg-danger/10 text-danger-foreground'
                                  : 'bg-success/10 text-success-foreground',
                              )}>
                                {isDebt ? 'دين' : 'دفعة'}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-foreground-muted text-xs max-w-40 truncate">
                              {isDebt
                                ? (inv.notes_ar ?? '—')
                                : [
                                    ar.supplierPayables.method[pmt.method],
                                    pmt.bank_name_ar,
                                    pmt.notes_ar,
                                  ].filter(Boolean).join(' · ')}
                            </td>
                            <td
                              className={cn(
                                'py-2.5 px-4 text-end tabular-num font-semibold',
                                isDebt ? 'text-danger-foreground' : 'text-success-foreground',
                              )}
                              dir="ltr"
                            >
                              {isDebt ? '+' : '−'} {fmtAmount(row.amount_egp)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {showAddDebt && selectedId !== null && (
        <AddDebtDialog
          supplierId={selectedId}
          onClose={() => setShowAddDebt(false)}
          onDone={() => setShowAddDebt(false)}
        />
      )}
      {showPayment && selectedId !== null && (
        <RecordPaymentDialog
          supplierId={selectedId}
          onClose={() => setShowPayment(false)}
          onDone={() => setShowPayment(false)}
        />
      )}

      <Dialog
        open={showAddSupplier}
        onOpenChange={(open) => { setShowAddSupplier(open); if (!open) setAddSupplierError(null); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{ar.supplierPayables.addSupplier}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={supplierForm.handleSubmit((v) => createSupplier.mutate(v))}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">
                اسم المورد
                <span className="text-danger ms-1" aria-hidden>*</span>
              </Label>
              <Input {...supplierForm.register('arabic_name', { required: true })} dir="rtl" />
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">رقم الهاتف</Label>
              <Input {...supplierForm.register('phone')} placeholder="01012345678" dir="ltr" inputMode="tel" />
            </div>
            {addSupplierError && (
              <p className="text-sm text-danger" role="alert">{addSupplierError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <DialogClose asChild>
                <Button type="button" variant="outline">{ar.common.cancel}</Button>
              </DialogClose>
              <Button type="submit" disabled={createSupplier.isPending}>{ar.common.save}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
