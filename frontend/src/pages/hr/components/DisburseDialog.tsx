import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { hrApi, type HrSalaryPreview } from '@/lib/hr-api';
import { bankAccountsApi } from '@/lib/settings-api';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Skeleton } from '@/components/Skeleton';
import { cn } from '@/lib/utils';
import { extractApiError } from '@/lib/api-error';
import { AlertTriangle } from 'lucide-react';
import { HrDialog } from './HrDialog';
import { MonthStepper } from './MonthStepper';
import { fmt, toMonthDate } from './utils';

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Disburse a salary for one employee. Self-contained: picks the month and loads that month's preview row. */
export function DisburseDialog({
  employeeId,
  employeeName,
  onClose,
  onDone,
}: {
  employeeId: number;
  employeeName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [month, setMonth] = useState(currentMonth());
  const [paidVia, setPaidVia] = useState<'cash' | 'instapay' | 'bank_transfer'>('cash');
  const [bankAccountId, setBankAccountId] = useState('');
  const [advanceRepayment, setAdvanceRepayment] = useState('');
  const [notesAr, setNotesAr] = useState('');
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: previewRows, isLoading } = useQuery<HrSalaryPreview[]>({
    queryKey: ['hr-salaries-preview', month],
    queryFn: () => hrApi.getMonthPreview(toMonthDate(month)),
  });
  const preview = previewRows?.find((r) => r.employee_id === employeeId);

  // Advances are repaid from salary: pre-fill the repayment with the full outstanding
  // for the loaded month so the advance is deducted by default (user can still lower it).
  useEffect(() => {
    if (preview && !preview.already_disbursed) {
      setAdvanceRepayment(preview.outstanding_advance_egp > 0 ? String(preview.outstanding_advance_egp) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview?.employee_id, preview?.outstanding_advance_egp, preview?.already_disbursed, month]);

  const { data: banks = [] } = useQuery({ queryKey: ['bank-accounts'], queryFn: bankAccountsApi.list });

  const mut = useMutation({
    mutationFn: () =>
      hrApi.disburse({
        employee_id: employeeId,
        month: toMonthDate(month),
        paid_via: paidVia,
        bank_account_id: paidVia !== 'cash' ? Number(bankAccountId) : null,
        advance_repayment_egp: Number(advanceRepayment) || 0,
        notes_ar: notesAr.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-salaries-preview'] });
      qc.invalidateQueries({ queryKey: ['hr-employee', employeeId] });
      qc.invalidateQueries({ queryKey: ['hr-advance-balance', employeeId] });
      qc.invalidateQueries({ queryKey: ['hr-balances'] });
      onDone();
    },
    onError: (e) => setError(extractApiError(e)),
  });

  const outstanding = preview?.outstanding_advance_egp ?? 0;
  const repaymentAmount = Math.min(Math.max(0, Number(advanceRepayment) || 0), outstanding);
  const netPreview = preview ? preview.base_salary_egp - preview.deductions_egp - repaymentAmount : 0;
  const needsBank = paidVia !== 'cash';
  const canSubmit = !!preview && !preview.already_disbursed && (!needsBank || !!bankAccountId) && netPreview >= 0;

  const inputCls =
    'h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <HrDialog title={`${ar.hr.salary.disburseTitle} — ${employeeName}`} onClose={onClose}>
      <div className="space-y-4">
        {error && <ErrorBanner title={ar.common.error} description={error} />}

        {/* Month */}
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-medium text-foreground">{ar.hr.salary.monthPicker}</label>
          <MonthStepper value={month} onChange={setMonth} />
        </div>

        {/* Unpaid-advance warning */}
        {outstanding > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning-subtle px-3 py-2.5 text-sm text-warning-foreground">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <span>
              {ar.hr.salary.advanceWarning}
              <span className="font-semibold tabular-num" dir="ltr"> ({fmt(outstanding)} ج.م)</span>
            </span>
          </div>
        )}

        {isLoading && <Skeleton className="h-24 w-full" />}

        {!isLoading && !preview && (
          <p className="text-sm text-foreground-muted">{ar.hr.employee.empty}</p>
        )}

        {preview?.already_disbursed && (
          <div className="rounded-lg border border-success/40 bg-success-subtle px-3 py-2.5 text-sm text-success-foreground">
            {ar.hr.salary.alreadyDisbursed}
          </div>
        )}

        {preview && !preview.already_disbursed && (
          <>
            <dl className="rounded-lg bg-surface p-3 space-y-1.5 text-sm border border-border-subtle">
              {[
                [ar.hr.salary.gross, `${fmt(preview.base_salary_egp)} ج.م`],
                [ar.hr.salary.deductionsTotal, `${fmt(preview.deductions_egp)} ج.م`],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between gap-4">
                  <dt className="text-foreground-muted">{l}</dt>
                  <dd className="font-medium text-foreground tabular-num">{v}</dd>
                </div>
              ))}
            </dl>

            {outstanding > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning-subtle p-3">
                <div className="flex items-center justify-between text-sm py-1">
                  <span className="text-warning-foreground font-medium">{ar.hr.salary.outstandingAdvance}</span>
                  <span className="tabular-num font-semibold text-warning-foreground" dir="ltr">
                    {fmt(outstanding)} ج.م
                  </span>
                </div>
                <div className="border-t border-warning/30 my-1.5" />
                <div className="flex items-center justify-between gap-3 text-sm py-1">
                  <label htmlFor="advance-repayment-input" className="text-foreground-muted shrink-0 cursor-pointer">
                    {ar.hr.salary.deductFromAdvance}
                  </label>
                  <div className="flex items-center gap-1.5" dir="ltr">
                    <input
                      id="advance-repayment-input"
                      type="number"
                      min={0}
                      max={outstanding}
                      step={1}
                      className="h-8 w-28 rounded-md border border-warning/60 bg-surface-elevated px-2 text-sm text-foreground tabular-num text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      value={advanceRepayment}
                      placeholder="0"
                      onChange={(e) => setAdvanceRepayment(e.target.value)}
                      onFocus={(e) => e.target.select()}
                    />
                    <span className="text-sm text-foreground-muted">ج.م</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center rounded-lg border border-border-default bg-surface px-3 py-2.5 text-sm">
              <span className="text-foreground-muted">{ar.hr.salary.net}</span>
              <span
                className={cn('tabular-num font-bold text-base', netPreview < 0 ? 'text-danger-foreground' : 'text-foreground')}
                dir="ltr"
              >
                {fmt(netPreview)} ج.م
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{ar.hr.salary.paidVia}</label>
              <div className="flex gap-2 flex-wrap">
                {(['cash', 'instapay', 'bank_transfer'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setPaidVia(m); setBankAccountId(''); }}
                    className={cn(
                      'h-8 px-3 rounded-md border text-xs transition-colors duration-150 cursor-pointer',
                      paidVia === m
                        ? 'bg-accent text-foreground-on-accent border-accent font-medium'
                        : 'bg-surface text-foreground-muted border-border-subtle hover:bg-surface-hover hover:text-foreground',
                    )}
                  >
                    {ar.hr.salary.methods[m]}
                  </button>
                ))}
              </div>
            </div>

            {needsBank && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{ar.hr.salary.bankAccount}</label>
                <select className={inputCls} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
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
              <label className="text-sm font-medium text-foreground">{ar.hr.salary.notes}</label>
              <input className={inputCls} dir="rtl" value={notesAr} onChange={(e) => setNotesAr(e.target.value)} />
            </div>
          </>
        )}

        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending || !canSubmit} className="min-w-28">
            {mut.isPending ? ar.loading : ar.hr.salary.disburse}
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            {ar.common.cancel}
          </Button>
        </div>
      </div>
    </HrDialog>
  );
}
