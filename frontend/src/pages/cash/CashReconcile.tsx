import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Calculator, CheckCircle2, AlertCircle, AlertOctagon } from 'lucide-react';
import { financeApi } from '@/lib/finance-api';
import { ar } from '@/i18n/ar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/utils';

const fmt = (n: string | number) =>
  Number(n).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtSigned = (n: number) => {
  const abs = Math.abs(n).toLocaleString('en-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return `${abs}`;
};

function todayCairo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

/**
 * Variance tone:
 *   - success: virtually zero variance (matched)
 *   - warning: small delta (< 50 EGP — within tolerance)
 *   - danger:  above threshold (>= 50 EGP — notify owner)
 *
 * The server still controls whether/how the owner is notified — this is presentation only.
 * If a server-driven threshold is wired in later, replace SMALL_DELTA_EGP with the setting.
 */
const SMALL_DELTA_EGP = 50;
type VarianceTone = 'success' | 'warning' | 'danger';
function varianceTone(variance: number): VarianceTone {
  const abs = Math.abs(variance);
  if (abs < 0.01) return 'success';
  if (abs < SMALL_DELTA_EGP) return 'warning';
  return 'danger';
}

const TONE_CLASSES: Record<VarianceTone, { box: string; text: string; icon: string }> = {
  success: {
    box: 'border-success/40 bg-success-subtle',
    text: 'text-success-foreground',
    icon: 'text-success',
  },
  warning: {
    box: 'border-warning/40 bg-warning-subtle',
    text: 'text-warning-foreground',
    icon: 'text-warning',
  },
  danger: {
    box: 'border-danger/40 bg-danger-subtle',
    text: 'text-danger-foreground',
    icon: 'text-danger',
  },
};

type CashReconForm = {
  date: string;
  actual_balance_egp: string;
  notes_ar: string;
};

type BankReconForm = {
  date: string;
  actual_balance_egp: string;
  notes_ar: string;
};

function ThreeColumnComparison({
  expected,
  actual,
  diff,
}: {
  expected: number;
  actual: number | null;
  diff: number | null;
}) {
  const tone: VarianceTone = diff === null ? 'success' : varianceTone(diff);
  const cls = TONE_CLASSES[tone];

  return (
    <div className="grid grid-cols-3 gap-3 rounded-lg border border-border-subtle bg-surface-elevated overflow-hidden shadow-sm">
      <div className="p-4 border-e border-border-subtle">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted mb-1.5">
          {ar.cash.expected}
        </p>
        <p className="text-2xl font-semibold text-foreground tabular-num leading-none" dir="ltr">
          {fmt(expected)}
        </p>
        <p className="text-xs text-foreground-tertiary mt-1.5">ج.م</p>
      </div>
      <div className="p-4 border-e border-border-subtle">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted mb-1.5">
          {ar.cash.actual}
        </p>
        {actual === null ? (
          <p className="text-2xl font-semibold text-foreground-tertiary tabular-num leading-none" dir="ltr">
            ——
          </p>
        ) : (
          <p className="text-2xl font-semibold text-foreground tabular-num leading-none" dir="ltr">
            {fmt(actual)}
          </p>
        )}
        <p className="text-xs text-foreground-tertiary mt-1.5">ج.م</p>
      </div>
      <div
        className={cn(
          // Highlight on the leading edge (visually inside, abutting the
          // "actual" column under RTL) so the variance cell reads as the
          // emphasized one of the three. border-s = logical start.
          'p-4 transition-colors duration-200 border-s-2',
          diff === null ? 'border-s-border-subtle' : cls.box,
        )}
      >
        <p
          className={cn(
            'text-xs font-medium uppercase tracking-wide mb-1.5',
            diff === null ? 'text-foreground-muted' : cls.text,
          )}
        >
          {ar.cash.variance}
        </p>
        {diff === null ? (
          <p className="text-2xl font-semibold text-foreground-tertiary tabular-num leading-none" dir="ltr">
            ——
          </p>
        ) : (
          <p className={cn('text-2xl font-semibold tabular-num leading-none', cls.text)} dir="ltr">
            {fmtSigned(diff)}
          </p>
        )}
        <p
          className={cn(
            'text-xs mt-1.5',
            diff === null ? 'text-foreground-tertiary' : cls.text + ' opacity-70',
          )}
        >
          ج.م
        </p>
      </div>
    </div>
  );
}

function ReconciliationResultBanner({ variance }: { variance: number }) {
  const tone = varianceTone(variance);
  const cls = TONE_CLASSES[tone];
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'warning' ? AlertCircle : AlertOctagon;
  const message =
    tone === 'success'
      ? ar.cash.noVariance
      : variance < 0
      ? 'عجز في الخزنة. تم تسجيل الفرق'
      : 'زيادة في الخزنة. تم تسجيل الفرق';
  return (
    <div
      role="status"
      className={cn(
        'rounded-lg border p-4 flex items-start gap-3 transition-colors duration-200',
        cls.box,
      )}
    >
      <Icon className={cn('size-5 shrink-0 mt-0.5', cls.icon)} aria-hidden />
      <div className="flex-1 min-w-0">
        <p className={cn('font-medium', cls.text)}>{message}</p>
        {tone !== 'success' && (
          <p className={cn('text-sm mt-1', cls.text + ' opacity-80')}>
            {ar.cash.variance}:{' '}
            <span className="tabular-num font-semibold" dir="ltr">
              {fmtSigned(variance)} ج.م
            </span>
            {tone === 'danger' && <span> · {ar.cash.discrepancyNotified}</span>}
          </p>
        )}
      </div>
    </div>
  );
}

export function CashReconcilePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'cash' | 'bank'>('cash');
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null);
  const [result, setResult] = useState<{ variance_egp: number } | null>(null);

  const balanceQ = useQuery({
    queryKey: ['cash-balance'],
    queryFn: financeApi.getCashBalance,
    enabled: tab === 'cash',
  });

  const banksQ = useQuery({
    queryKey: ['banks'],
    queryFn: financeApi.listBanks,
    enabled: tab === 'bank',
  });

  const selectedBank = banksQ.data?.find((b) => b.id === selectedBankId);

  const cashForm = useForm<CashReconForm>({
    defaultValues: { date: todayCairo(), actual_balance_egp: '', notes_ar: '' },
  });

  const bankForm = useForm<BankReconForm>({
    defaultValues: { date: todayCairo(), actual_balance_egp: '', notes_ar: '' },
  });

  const cashActualRaw = cashForm.watch('actual_balance_egp');
  const bankActualRaw = bankForm.watch('actual_balance_egp');

  const cashExpected = Number(balanceQ.data?.current_balance_egp ?? 0);
  const cashActual = useMemo(() => {
    const v = parseFloat(cashActualRaw);
    return Number.isFinite(v) ? v : null;
  }, [cashActualRaw]);
  const cashDiff = cashActual === null ? null : cashActual - cashExpected;

  const bankExpected = Number(selectedBank?.current_balance_egp ?? 0);
  const bankActual = useMemo(() => {
    const v = parseFloat(bankActualRaw);
    return Number.isFinite(v) ? v : null;
  }, [bankActualRaw]);
  const bankDiff = bankActual === null || !selectedBank ? null : bankActual - bankExpected;

  const cashMut = useMutation({
    mutationFn: (d: CashReconForm) =>
      financeApi.reconcileCash({
        date: d.date,
        actual_balance_egp: Number(d.actual_balance_egp),
        notes_ar: d.notes_ar || null,
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['cash-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-movements'] });
      setResult(data);
      cashForm.reset({ date: todayCairo(), actual_balance_egp: '', notes_ar: '' });
    },
  });

  const bankMut = useMutation({
    mutationFn: (d: BankReconForm) => {
      if (!selectedBankId) throw new Error('NO_BANK_SELECTED');
      return financeApi.reconcileBank(selectedBankId, {
        date: d.date,
        actual_balance_egp: Number(d.actual_balance_egp),
        notes_ar: d.notes_ar || null,
      });
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['banks'] });
      qc.invalidateQueries({ queryKey: ['bank-movements'] });
      setResult(data);
      bankForm.reset({ date: todayCairo(), actual_balance_egp: '', notes_ar: '' });
    },
  });

  const switchTab = (next: 'cash' | 'bank') => {
    setTab(next);
    setResult(null);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader title={ar.cash.reconcile} description={ar.hubs.reconcileDesc} />

      {/* Tab selector — sliding indicator */}
      <div className="flex gap-1 border-b border-border-subtle">
        <button
          type="button"
          onClick={() => switchTab('cash')}
          className={cn(
            'relative px-4 py-2 text-sm font-medium transition-colors duration-150',
            tab === 'cash' ? 'text-accent' : 'text-foreground-muted hover:text-foreground',
          )}
        >
          الخزنة النقدية
          {tab === 'cash' && (
            <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent rounded-pill" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={() => switchTab('bank')}
          className={cn(
            'relative px-4 py-2 text-sm font-medium transition-colors duration-150',
            tab === 'bank' ? 'text-accent' : 'text-foreground-muted hover:text-foreground',
          )}
        >
          البنك
          {tab === 'bank' && (
            <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent rounded-pill" aria-hidden />
          )}
        </button>
      </div>

      {/* Result display */}
      {result && <ReconciliationResultBanner variance={result.variance_egp} />}

      {tab === 'cash' && balanceQ.data && (
        <div className="space-y-4">
          <ThreeColumnComparison
            expected={cashExpected}
            actual={cashActual}
            diff={cashDiff}
          />

          <form
            onSubmit={cashForm.handleSubmit((d) => cashMut.mutate(d))}
            className="rounded-lg border border-border-subtle bg-surface-elevated p-5 shadow-sm space-y-4"
          >
            <div className="flex items-center gap-2">
              <Calculator className="size-4 text-foreground-tertiary" aria-hidden />
              <h2 className="text-base font-semibold text-foreground">تسوية الخزنة النقدية</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>
                  تاريخ التسوية <span className="text-danger">*</span>
                </Label>
                <Input type="date" {...cashForm.register('date', { required: true })} />
              </div>
              <div className="space-y-1.5">
                <Label>
                  الرصيد الفعلي (عد نقدي) <span className="text-danger">*</span>
                </Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  {...cashForm.register('actual_balance_egp', { required: true })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>ملاحظات</Label>
              <Input {...cashForm.register('notes_ar')} />
            </div>
            {cashMut.error && (
              <p className="text-danger-foreground text-sm bg-danger-subtle rounded-md p-2.5">حدث خطأ</p>
            )}
            <div className="flex justify-end">
              <Button type="submit" variant="accent" disabled={cashMut.isPending}>
                {cashMut.isPending ? 'جاري التسوية...' : 'تأكيد التسوية'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {tab === 'bank' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border-subtle bg-surface-elevated p-5 shadow-sm">
            <div className="space-y-1.5">
              <Label>الحساب البنكي</Label>
              <select
                className="w-full rounded-md border border-border-default bg-surface-elevated h-10 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                value={selectedBankId ?? ''}
                onChange={(e) =>
                  setSelectedBankId(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">-- اختر حساب --</option>
                {(banksQ.data ?? [])
                  .filter((b) => b.is_active)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name_ar} {b.bank_name_ar ? `(${b.bank_name_ar})` : ''}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {selectedBank && (
            <>
              <ThreeColumnComparison
                expected={bankExpected}
                actual={bankActual}
                diff={bankDiff}
              />

              <form
                onSubmit={bankForm.handleSubmit((d) => bankMut.mutate(d))}
                className="rounded-lg border border-border-subtle bg-surface-elevated p-5 shadow-sm space-y-4"
              >
                <div className="flex items-center gap-2">
                  <Calculator className="size-4 text-foreground-tertiary" aria-hidden />
                  <h2 className="text-base font-semibold text-foreground">تسوية البنك</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>
                      تاريخ التسوية <span className="text-danger">*</span>
                    </Label>
                    <Input type="date" {...bankForm.register('date', { required: true })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      الرصيد الفعلي (كشف الحساب) <span className="text-danger">*</span>
                    </Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      {...bankForm.register('actual_balance_egp', { required: true })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>ملاحظات</Label>
                  <Input {...bankForm.register('notes_ar')} />
                </div>
                {bankMut.error && (
                  <p className="text-danger-foreground text-sm bg-danger-subtle rounded-md p-2.5">حدث خطأ</p>
                )}
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="accent"
                    disabled={bankMut.isPending || !selectedBankId}
                  >
                    {bankMut.isPending ? 'جاري التسوية...' : 'تأكيد التسوية'}
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}
