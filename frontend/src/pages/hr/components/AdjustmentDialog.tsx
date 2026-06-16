import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { hrApi } from '@/lib/hr-api';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ErrorBanner';
import { cn } from '@/lib/utils';
import { extractApiError } from '@/lib/api-error';
import { HrDialog } from './HrDialog';
import { MonthStepper } from './MonthStepper';
import { inputCls, toMonthDate, currentMonthYM, nextMonthYM } from './utils';

/**
 * Record an advance or deduction for a single, already-selected employee.
 * Advances are always repaid from the NEXT month's salary (no month picker shown).
 * Deductions apply to a chosen month, defaulting to the current month.
 */
export function AdjustmentDialog({
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
  const [kind, setKind] = useState<'advance' | 'deduction'>('advance');
  const [amount, setAmount] = useState('');
  const [salaryMonth, setSalaryMonth] = useState(currentMonthYM());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: () =>
      hrApi.createAdjustment({
        employee_id: employeeId,
        kind,
        amount_egp: Number(amount),
        salary_month: toMonthDate(kind === 'advance' ? nextMonthYM() : salaryMonth),
        reason_ar: reason.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-adjustments', employeeId] });
      qc.invalidateQueries({ queryKey: ['hr-employee', employeeId] });
      qc.invalidateQueries({ queryKey: ['hr-advance-balance', employeeId] });
      qc.invalidateQueries({ queryKey: ['hr-balances'] });
      onDone();
    },
    onError: (e) => setError(extractApiError(e)),
  });

  const canSubmit = Number(amount) > 0 && !!salaryMonth;

  return (
    <HrDialog title={`${ar.hr.adjustment.createTitle} — ${employeeName}`} onClose={onClose}>
      <div className="space-y-4">
        {error && <ErrorBanner title={ar.common.error} description={error} />}

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">{ar.hr.adjustment.kind}</label>
          <div className="flex gap-2">
            {(['advance', 'deduction'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  'h-8 px-3 rounded-md border text-xs transition-colors duration-150 cursor-pointer',
                  kind === k
                    ? 'bg-accent text-foreground-on-accent border-accent font-medium'
                    : 'bg-surface text-foreground-muted border-border-subtle hover:bg-surface-hover hover:text-foreground',
                )}
              >
                {k === 'advance' ? ar.hr.adjustment.advance : ar.hr.adjustment.deduction}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">{ar.hr.adjustment.amount}</label>
          <input
            type="number"
            min={1}
            step={1}
            className={cn(inputCls, 'w-44')}
            style={{ unicodeBidi: 'plaintext' }}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
        </div>

        {kind === 'deduction' && (
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium text-foreground">{ar.hr.adjustment.salaryMonth}</label>
            <MonthStepper value={salaryMonth} onChange={setSalaryMonth} />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">{ar.hr.adjustment.reason}</label>
          <input className={inputCls} dir="rtl" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending || !canSubmit} className="min-w-24">
            {mut.isPending ? ar.loading : ar.common.save}
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            {ar.common.cancel}
          </Button>
        </div>
      </div>
    </HrDialog>
  );
}
