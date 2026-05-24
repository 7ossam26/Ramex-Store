import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { hrApi, type HrSalaryAdjustment } from '@/lib/hr-api';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/Layout/PageShell';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Skeleton } from '@/components/Skeleton';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { StatusPill } from '@/components/StatusPill';
import { cn } from '@/lib/utils';
import { extractApiError } from '@/lib/api-error';
import { format } from 'date-fns';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: string | number) {
  return Number(v).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toMonthDate(ym: string) {
  return `${ym}-01`;
}

// ─── Create Dialog ────────────────────────────────────────────────────────────

type CreateForm = {
  employee_id: string;
  kind: 'advance' | 'deduction';
  amount_egp: string;
  salary_month: string;
  reason_ar: string;
};

function CreateAdjustmentDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const today = new Date();
  const [form, setForm] = useState<CreateForm>({
    employee_id: '',
    kind: 'advance',
    amount_egp: '',
    salary_month: format(today, 'yyyy-MM'),
    reason_ar: '',
  });
  const [error, setError] = useState<string | null>(null);

  const { data: empData } = useQuery({
    queryKey: ['hr-employees-active'],
    queryFn: () => hrApi.listEmployees({ is_active: true, limit: 200 }),
  });
  const employees = empData?.rows ?? [];

  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () =>
      hrApi.createAdjustment({
        employee_id: Number(form.employee_id),
        kind: form.kind,
        amount_egp: Number(form.amount_egp),
        salary_month: toMonthDate(form.salary_month),
        reason_ar: form.reason_ar.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-adjustments'] });
      qc.invalidateQueries({ queryKey: ['hr-salaries-preview'] });
      onDone();
    },
    onError: (e) => setError(extractApiError(e)),
  });

  const canSubmit =
    !!form.employee_id &&
    Number(form.amount_egp) > 0 &&
    !!form.salary_month;

  const inputCls =
    'h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground ' +
    'placeholder:text-foreground-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        dir="rtl"
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-md rounded-xl border border-border-subtle bg-surface-elevated shadow-xl">
          <header className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
            <h2 className="text-base font-semibold text-foreground">{ar.hr.adjustment.createTitle}</h2>
            <button
              type="button"
              aria-label={ar.mobile.close}
              onClick={onClose}
              className="size-8 flex items-center justify-center rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
            >
              ✕
            </button>
          </header>

          <div className="p-5 space-y-4">
            {error && <ErrorBanner title={ar.common.error} description={error} />}

            {/* Employee */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{ar.hr.employee.nameAr}</label>
              <select
                className={inputCls}
                value={form.employee_id}
                onChange={(e) => setForm((f) => ({ ...f, employee_id: e.target.value }))}
              >
                <option value="">— اختر موظفاً —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name_ar}
                  </option>
                ))}
              </select>
            </div>

            {/* Kind */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{ar.hr.adjustment.kind}</label>
              <div className="flex gap-2">
                {(['advance', 'deduction'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, kind: k }))}
                    className={cn(
                      'h-8 px-3 rounded-md border text-xs transition-colors duration-150 cursor-pointer',
                      form.kind === k
                        ? 'bg-accent text-foreground-on-accent border-accent font-medium'
                        : 'bg-surface text-foreground-muted border-border-subtle hover:bg-surface-hover hover:text-foreground',
                    )}
                  >
                    {k === 'advance' ? ar.hr.adjustment.advance : ar.hr.adjustment.deduction}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{ar.hr.adjustment.amount}</label>
              <input
                type="number"
                min={1}
                step={1}
                className={cn(inputCls, 'w-44')}
                style={{ unicodeBidi: 'plaintext' }}
                value={form.amount_egp}
                onChange={(e) => setForm((f) => ({ ...f, amount_egp: e.target.value }))}
              />
            </div>

            {/* Salary month */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{ar.hr.adjustment.salaryMonth}</label>
              <input
                type="month"
                className={cn(inputCls, 'w-44')}
                value={form.salary_month}
                onChange={(e) => setForm((f) => ({ ...f, salary_month: e.target.value }))}
              />
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{ar.hr.adjustment.reason}</label>
              <input
                className={inputCls}
                dir="rtl"
                value={form.reason_ar}
                onChange={(e) => setForm((f) => ({ ...f, reason_ar: e.target.value }))}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => mut.mutate()}
                disabled={mut.isPending || !canSubmit}
                className="min-w-24"
              >
                {mut.isPending ? ar.loading : ar.common.save}
              </Button>
              <Button size="sm" variant="outline" onClick={onClose}>
                {ar.common.cancel}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type KindFilter = 'all' | 'advance' | 'deduction';

export function AdjustmentsPage() {
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['hr-adjustments', kindFilter],
    queryFn: () =>
      hrApi.listAdjustments({
        kind: kindFilter === 'all' ? undefined : kindFilter,
        limit: 100,
      }),
  });

  const rows: HrSalaryAdjustment[] = data?.rows ?? [];

  return (
    <PageShell title={ar.hr.adjustments} description={ar.hr.title} backTo="/hr">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {([
            ['all', ar.hr.adjustment.filterAll],
            ['advance', ar.hr.adjustment.filterAdvance],
            ['deduction', ar.hr.adjustment.filterDeduction],
          ] as [KindFilter, string][]).map(([f, label]) => (
            <button
              key={f}
              type="button"
              onClick={() => setKindFilter(f)}
              className={cn(
                'h-8 px-3 rounded-pill text-xs border transition-colors duration-150 cursor-pointer',
                kindFilter === f
                  ? 'bg-accent text-foreground-on-accent border-accent font-medium'
                  : 'bg-surface-elevated text-foreground-muted border-border-subtle hover:text-foreground hover:bg-surface-hover',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          {ar.hr.adjustment.addAdjustment}
        </Button>
      </div>

      <ResponsiveTable<HrSalaryAdjustment>
        columns={[
          {
            key: 'employee',
            header: ar.hr.employee.nameAr,
            primary: true,
            cell: (r) => (
              <span className="font-medium text-foreground">
                {r.employee_name_ar ?? `#${r.employee_id}`}
              </span>
            ),
          },
          {
            key: 'kind',
            header: ar.hr.adjustment.kind,
            secondary: true,
            cell: (r) => (
              <StatusPill tone={r.kind === 'advance' ? 'warning' : 'danger'}>
                {r.kind === 'advance' ? ar.hr.adjustment.advance : ar.hr.adjustment.deduction}
              </StatusPill>
            ),
          },
          {
            key: 'amount',
            header: ar.hr.adjustment.amount,
            align: 'end',
            cell: (r) => (
              <span className="tabular-num font-medium text-foreground" dir="ltr">
                {fmt(r.amount_egp)} <span className="text-foreground-tertiary text-xs">ج.م</span>
              </span>
            ),
          },
          {
            key: 'month',
            header: ar.hr.adjustment.salaryMonth,
            cell: (r) => (
              <span className="text-foreground-muted tabular-num">{r.salary_month.slice(0, 7)}</span>
            ),
          },
          {
            key: 'reason',
            header: ar.hr.adjustment.reason,
            hideOnMobile: true,
            cell: (r) => (
              <span className="text-foreground-muted text-xs max-w-48 truncate block">{r.reason_ar ?? '—'}</span>
            ),
          },
        ]}
        rows={rows}
        rowKey={(r) => String(r.id)}
        isLoading={isLoading}
        isError={!!error}
        onRetry={() => refetch()}
        errorTitle={ar.common.error}
        empty={ar.hr.adjustment.empty}
        resetKey={`${kindFilter}`}
      />

      {showCreate && (
        <CreateAdjustmentDialog
          onClose={() => setShowCreate(false)}
          onDone={() => setShowCreate(false)}
        />
      )}
    </PageShell>
  );
}
