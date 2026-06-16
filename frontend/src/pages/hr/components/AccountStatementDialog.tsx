import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { ar } from '@/i18n/ar';
import { hrApi } from '@/lib/hr-api';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Skeleton } from '@/components/Skeleton';
import { StatusPill } from '@/components/StatusPill';
import { extractApiError } from '@/lib/api-error';
import { HrDialog } from './HrDialog';
import { fmt, buildActivity, type ActivityItem } from './utils';

const KIND_TONE = {
  salary: 'success',
  advance: 'warning',
  deduction: 'danger',
} as const;

function kindLabel(kind: ActivityItem['kind']) {
  return kind === 'salary'
    ? ar.hr.movement.salary
    : kind === 'advance'
      ? ar.hr.movement.advance
      : ar.hr.movement.deduction;
}

/** Full account statement for one employee: salaries + advances + deductions, newest first. */
export function AccountStatementDialog({
  employeeId,
  employeeName,
  onClose,
}: {
  employeeId: number;
  employeeName: string;
  onClose: () => void;
}) {
  const disbQ = useQuery({
    queryKey: ['hr-salaries', employeeId],
    queryFn: () => hrApi.listDisbursements({ employee_id: employeeId, limit: 100 }),
  });
  const adjQ = useQuery({
    queryKey: ['hr-adjustments', employeeId],
    queryFn: () => hrApi.listAdjustments({ employee_id: employeeId, limit: 100 }),
  });

  const isLoading = disbQ.isLoading || adjQ.isLoading;
  const error = disbQ.error || adjQ.error;
  const items = buildActivity(disbQ.data?.rows ?? [], adjQ.data?.rows ?? []);

  return (
    <HrDialog title={`${ar.hr.detail.statementTitle} — ${employeeName}`} onClose={onClose} maxW="max-w-lg">
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      )}
      {error && <ErrorBanner title={ar.common.error} description={extractApiError(error)} />}

      {!isLoading && !error && (
        items.length === 0 ? (
          <p className="text-sm text-foreground-muted py-4 text-center">{ar.hr.detail.noMovements}</p>
        ) : (
          <div className="rounded-lg border border-border-subtle overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-surface-row-alt text-foreground-muted">
                <tr>
                  <th className="py-2 px-3 text-start font-medium">{ar.hr.adjustment.kind}</th>
                  <th className="py-2 px-3 text-start font-medium">{ar.hr.salary.month}</th>
                  <th className="py-2 px-3 text-end font-medium">{ar.hr.adjustment.amount}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle bg-surface-elevated">
                {items.map((it) => (
                  <tr key={it.id} className="hover:bg-surface-hover transition-colors">
                    <td className="py-2 px-3">
                      <StatusPill tone={KIND_TONE[it.kind]}>{kindLabel(it.kind)}</StatusPill>
                    </td>
                    <td className="py-2 px-3 text-foreground-muted">
                      {format(new Date(it.date), 'yyyy/MM/dd', { locale: arSA })}
                      {it.sub && <span className="block text-foreground-tertiary">{it.sub}</span>}
                    </td>
                    <td className="py-2 px-3 text-end font-medium text-foreground tabular-num" dir="ltr">
                      {fmt(it.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </HrDialog>
  );
}
