import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { FileText, Wallet, Pencil, Banknote, History } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { hrApi, type HrEmployee, type HrEmployeeDetail } from '@/lib/hr-api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/Skeleton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { StatusPill } from '@/components/StatusPill';
import { extractApiError } from '@/lib/api-error';
import { ActionCard } from './ActionCard';
import { EmployeeFormDialog } from './EmployeeFormDialog';
import { AdjustmentDialog } from './AdjustmentDialog';
import { DisburseDialog } from './DisburseDialog';
import { AccountStatementDialog } from './AccountStatementDialog';
import { fmt, buildActivity, type ActivityItem } from './utils';

type OpenDialog = 'statement' | 'advance' | 'edit' | 'disburse' | null;

const KIND_TONE = { salary: 'success', advance: 'warning', deduction: 'danger' } as const;

function kindLabel(kind: ActivityItem['kind']) {
  return kind === 'salary'
    ? ar.hr.movement.salary
    : kind === 'advance' ? ar.hr.movement.advance : ar.hr.movement.deduction;
}

const SHELL = 'h-full rounded-xl border border-border-subtle bg-surface-elevated shadow-sm flex flex-col overflow-hidden';

export function EmployeeDetailPane({ employeeId }: { employeeId: number }) {
  const [dialog, setDialog] = useState<OpenDialog>(null);

  const empQ = useQuery<HrEmployeeDetail>({
    queryKey: ['hr-employee', employeeId],
    queryFn: () => hrApi.getEmployee(employeeId),
  });
  const balanceQ = useQuery({
    queryKey: ['hr-advance-balance', employeeId],
    queryFn: () => hrApi.getAdvanceBalance(employeeId),
  });
  const adjQ = useQuery({
    queryKey: ['hr-adjustments', employeeId],
    queryFn: () => hrApi.listAdjustments({ employee_id: employeeId, limit: 500 }),
  });

  const emp = empQ.data;
  // "إجمالي السلف الحالية" = current outstanding advances (sum advances − repayments).
  const outstanding = balanceQ.data?.outstanding_advance_egp ?? 0;
  const adjustments = adjQ.data?.rows ?? [];
  const activity = buildActivity(emp?.last_disbursements ?? [], adjustments).slice(0, 8);

  if (empQ.isLoading) {
    return (
      <section className={SHELL}>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        </div>
      </section>
    );
  }

  if (empQ.error || !emp) {
    return (
      <section className={SHELL}>
        <div className="p-6">
          <ErrorBanner
            title={ar.common.error}
            description={empQ.error ? extractApiError(empQ.error) : ar.common.error}
          />
        </div>
      </section>
    );
  }

  const empForEdit: HrEmployee = emp;

  return (
    <section className={SHELL}>
      {/* Top block */}
      <header className="flex items-start justify-between gap-4 p-6 border-b border-border-subtle shrink-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground truncate">{emp.name_ar}</h1>
          <p className="text-sm text-foreground-muted mt-1">
            {emp.role_ar ?? '—'}
            {!emp.is_active && (
              <StatusPill tone="neutral" className="ms-2">{ar.hr.employee.filterInactive}</StatusPill>
            )}
          </p>
        </div>
        <div className="text-end shrink-0">
          <div className="text-2xl font-bold text-foreground tabular-num" dir="ltr">{fmt(outstanding)}</div>
          <div className="text-xs text-foreground-muted">{ar.hr.employee.totalAdjustments}</div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Action grid */}
        <div className="grid grid-cols-2 gap-3">
          <ActionCard label={ar.hr.detail.accountStatement} icon={FileText} onClick={() => setDialog('statement')} />
          <ActionCard label={ar.hr.detail.advance} icon={Wallet} onClick={() => setDialog('advance')} />
          <ActionCard label={ar.hr.detail.editData} icon={Pencil} onClick={() => setDialog('edit')} className="col-span-2" />
        </div>

        {/* Disburse salary */}
        <Button className="w-full gap-2" onClick={() => setDialog('disburse')}>
          <Banknote size={18} />
          {ar.hr.detail.disburseSalary}
        </Button>

        {/* Activity log */}
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <History size={16} className="text-foreground-muted" />
            {ar.hr.detail.movementsLog}
            <span className="text-foreground-muted tabular-num">({activity.length})</span>
          </h3>
          {adjQ.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : activity.length === 0 ? (
            <p className="text-sm text-foreground-muted py-3">{ar.hr.detail.noMovements}</p>
          ) : (
            <ul className="rounded-lg border border-border-subtle divide-y divide-border-subtle overflow-hidden">
              {activity.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm bg-surface-elevated">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusPill tone={KIND_TONE[it.kind]}>{kindLabel(it.kind)}</StatusPill>
                    <span className="text-foreground-muted text-xs truncate">{it.sub}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-foreground font-medium tabular-num" dir="ltr">{fmt(it.amount)}</span>
                    <span className="text-foreground-tertiary text-xs tabular-num">
                      {format(new Date(it.date), 'yyyy/MM/dd', { locale: arSA })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Dialogs */}
      {dialog === 'statement' && (
        <AccountStatementDialog employeeId={emp.id} employeeName={emp.name_ar} onClose={() => setDialog(null)} />
      )}
      {dialog === 'advance' && (
        <AdjustmentDialog
          employeeId={emp.id}
          employeeName={emp.name_ar}
          onClose={() => setDialog(null)}
          onDone={() => setDialog(null)}
        />
      )}
      {dialog === 'edit' && (
        <EmployeeFormDialog
          employee={empForEdit}
          onClose={() => setDialog(null)}
          onDone={() => setDialog(null)}
        />
      )}
      {dialog === 'disburse' && (
        <DisburseDialog
          employeeId={emp.id}
          employeeName={emp.name_ar}
          onClose={() => setDialog(null)}
          onDone={() => setDialog(null)}
        />
      )}
    </section>
  );
}
