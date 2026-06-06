import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { hrApi, type HrSalaryPreview } from '@/lib/hr-api';
import { bankAccountsApi } from '@/lib/settings-api';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/Layout/PageShell';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { StatusPill } from '@/components/StatusPill';
import { cn } from '@/lib/utils';
import { extractApiError } from '@/lib/api-error';
import { format } from 'date-fns';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number) {
  return v.toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toMonthDate(ym: string) {
  return `${ym}-01`;
}

// ─── Disburse Dialog ──────────────────────────────────────────────────────────

type DisburseDialogProps = {
  preview: HrSalaryPreview;
  month: string;
  onClose: () => void;
  onDone: () => void;
};

function DisburseDialog({ preview, month, onClose, onDone }: DisburseDialogProps) {
  const [paidVia, setPaidVia] = useState<'cash' | 'instapay' | 'bank_transfer'>('cash');
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [advanceRepayment, setAdvanceRepayment] = useState<string>('');
  const [notesAr, setNotesAr] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: banks = [] } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: bankAccountsApi.list,
  });

  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () =>
      hrApi.disburse({
        employee_id: preview.employee_id,
        month: toMonthDate(month),
        paid_via: paidVia,
        bank_account_id: paidVia !== 'cash' ? Number(bankAccountId) : null,
        advance_repayment_egp: Number(advanceRepayment) || 0,
        notes_ar: notesAr.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-salaries-preview'] });
      onDone();
    },
    onError: (e) => setError(extractApiError(e)),
  });

  const repaymentAmount = Math.min(
    Math.max(0, Number(advanceRepayment) || 0),
    preview.outstanding_advance_egp,
  );
  const netPreview = preview.base_salary_egp - preview.deductions_egp - repaymentAmount;
  const needsBank = paidVia !== 'cash';
  const canSubmit = !needsBank || !!bankAccountId;

  const inputCls =
    'h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        dir="rtl"
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-md rounded-xl border border-border-subtle bg-surface-elevated shadow-xl">
          <header className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
            <h2 className="text-base font-semibold text-foreground">
              {ar.hr.salary.disburseTitle} — {preview.name_ar}
            </h2>
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

            {/* Salary summary */}
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

            {/* Outstanding advance + repayment input */}
            {preview.outstanding_advance_egp > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning-subtle p-3 space-y-0">
                {/* Balance row */}
                <div className="flex items-center justify-between text-sm py-1">
                  <span className="text-warning-foreground font-medium">{ar.hr.salary.outstandingAdvance}</span>
                  <span className="tabular-num font-semibold text-warning-foreground" dir="ltr">
                    {fmt(preview.outstanding_advance_egp)} ج.م
                  </span>
                </div>

                {/* Divider */}
                <div className="border-t border-warning/30 my-1.5" />

                {/* Repayment input row — same layout as balance row above */}
                <div className="flex items-center justify-between gap-3 text-sm py-1">
                  <label
                    htmlFor="advance-repayment-input"
                    className="text-foreground-muted shrink-0 cursor-pointer"
                  >
                    {ar.hr.salary.deductFromAdvance}
                  </label>
                  <div className="flex items-center gap-1.5" dir="ltr">
                    <input
                      id="advance-repayment-input"
                      type="number"
                      min={0}
                      max={preview.outstanding_advance_egp}
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

            {/* Net preview */}
            <div className="flex justify-between items-center rounded-lg border border-border-default bg-surface px-3 py-2.5 text-sm">
              <span className="text-foreground-muted">{ar.hr.salary.net}</span>
              <span
                className={cn(
                  'tabular-num font-bold text-base',
                  netPreview < 0 ? 'text-danger-foreground' : 'text-foreground',
                )}
                dir="ltr"
              >
                {fmt(netPreview)} ج.م
              </span>
            </div>

            {/* Payment method */}
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

            {/* Bank account */}
            {needsBank && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{ar.hr.salary.bankAccount}</label>
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

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{ar.hr.salary.notes}</label>
              <input
                className={inputCls}
                dir="rtl"
                value={notesAr}
                onChange={(e) => setNotesAr(e.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => mut.mutate()}
                disabled={mut.isPending || !canSubmit || netPreview < 0}
                className="min-w-28"
              >
                {mut.isPending ? ar.loading : ar.hr.salary.disburse}
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

export function SalariesPage() {
  const today = new Date();
  const [month, setMonth] = useState(format(today, 'yyyy-MM'));
  const [disbursingPreview, setDisbursingPreview] = useState<HrSalaryPreview | null>(null);

  const { data: preview, isLoading, error, refetch } = useQuery<HrSalaryPreview[]>({
    queryKey: ['hr-salaries-preview', month],
    queryFn: () => hrApi.getMonthPreview(toMonthDate(month)),
  });

  const rows = preview ?? [];
  const totalNet = rows.reduce((s, r) => s + r.net_egp, 0);
  const pendingCount = rows.filter((r) => !r.already_disbursed).length;
  const totalOutstandingAdvances = rows.reduce((s, r) => s + r.outstanding_advance_egp, 0);

  const columns: Column<HrSalaryPreview>[] = [
    {
      key: 'name',
      header: ar.hr.employee.nameAr,
      primary: true,
      cell: (r) => <span className="font-medium text-foreground">{r.name_ar}</span>,
    },
    {
      key: 'gross',
      header: `${ar.hr.salary.gross} (ج.م)`,
      align: 'end',
      cell: (r) => (
        <span className="tabular-num text-foreground" dir="ltr">
          {fmt(r.base_salary_egp)}
        </span>
      ),
    },
    {
      key: 'deductions',
      header: `${ar.hr.salary.deductionsTotal} (ج.م)`,
      align: 'end',
      secondary: true,
      cell: (r) => (
        <span className={cn('tabular-num', r.deductions_egp > 0 ? 'text-danger-foreground' : 'text-foreground-muted')} dir="ltr">
          {r.deductions_egp > 0 ? `− ${fmt(r.deductions_egp)}` : '—'}
        </span>
      ),
    },
    {
      key: 'advance',
      header: `${ar.hr.salary.outstandingAdvance} (ج.م)`,
      align: 'end',
      secondary: true,
      cell: (r) => (
        <span className={cn('tabular-num', r.outstanding_advance_egp > 0 ? 'text-warning-foreground font-medium' : 'text-foreground-muted')} dir="ltr">
          {r.outstanding_advance_egp > 0 ? fmt(r.outstanding_advance_egp) : '—'}
        </span>
      ),
    },
    {
      key: 'net',
      header: `${ar.hr.salary.net} (ج.م)`,
      align: 'end',
      cell: (r) => (
        <span className="tabular-num font-semibold text-foreground" dir="ltr">
          {fmt(r.net_egp)}
        </span>
      ),
    },
    {
      key: 'action',
      header: ar.hr.salary.disburse,
      align: 'center',
      cell: (r) =>
        r.already_disbursed ? (
          <StatusPill tone="success">{ar.hr.salary.alreadyDisbursed}</StatusPill>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="cursor-pointer text-xs h-7"
            onClick={(e) => { e.stopPropagation(); setDisbursingPreview(r); }}
          >
            {ar.hr.salary.disburse}
          </Button>
        ),
    },
  ];

  return (
    <PageShell title={ar.hr.salaries} description={ar.hr.salary.previewHint} backTo="/hr">
      {/* Month picker + summary chips */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="space-y-0.5">
          <label className="text-xs text-foreground-muted">{ar.hr.salary.monthPicker}</label>
          <input
            type="month"
            className="h-9 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-foreground-muted mt-3">
          <span>
            بانتظار الصرف:{' '}
            <span className="font-semibold text-foreground">{pendingCount}</span>
          </span>
          <span>
            إجمالي الصافي:{' '}
            <span className="font-semibold text-foreground tabular-num">{fmt(totalNet)} ج.م</span>
          </span>
          {totalOutstandingAdvances > 0 && (
            <span>
              سُلَف مستحقة:{' '}
              <span className="font-semibold text-warning-foreground tabular-num">{fmt(totalOutstandingAdvances)} ج.م</span>
            </span>
          )}
        </div>
      </div>

      <ResponsiveTable<HrSalaryPreview>
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.employee_id)}
        isLoading={isLoading}
        isError={!!error}
        onRetry={() => refetch()}
        errorTitle={ar.common.error}
        empty={ar.hr.salary.empty}
        resetKey={month}
      />

      {disbursingPreview && (
        <DisburseDialog
          preview={disbursingPreview}
          month={month}
          onClose={() => setDisbursingPreview(null)}
          onDone={() => setDisbursingPreview(null)}
        />
      )}
    </PageShell>
  );
}
