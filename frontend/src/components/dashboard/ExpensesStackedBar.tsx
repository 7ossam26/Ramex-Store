import { useMemo } from 'react';
import { ar } from '@/i18n/ar';
import { CHART_PALETTE } from '@/pages/reports/SecondaryReportChart';
import { WidgetCard } from './states';
import { QuietEmpty } from './QuietEmpty';
import { fmtMoney } from './format';
import type { ExpensesSummary } from '@/lib/owner-api';

const SERIES = [
  CHART_PALETTE.primary,
  CHART_PALETTE.secondary,
  CHART_PALETTE.tertiary,
  CHART_PALETTE.warning,
  CHART_PALETTE.neutral,
  CHART_PALETTE.axis,
];

/* Horizontal stacked bar — categories laid out side-by-side as one bar.
 * Avoids recharts complexity since the data is already aggregated. */
export function ExpensesStackedBar({ data }: { data: ExpensesSummary }) {
  const total = data.grand_total_egp;
  const categoryLabels = ar.cash.expenseCategories;

  const rows = useMemo(
    () =>
      data.by_category
        .map((c, i) => ({
          key: c.category,
          label:
            categoryLabels[c.category as keyof typeof categoryLabels] ??
            c.category,
          total: Number(c.total_egp) || 0,
          count: c.expense_count,
          color: SERIES[i % SERIES.length],
        }))
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total),
    [data, categoryLabels],
  );

  return (
    <WidgetCard
      title={ar.dashboard.movers.expensesTitle}
      action={
        <span className="text-xs text-foreground-tertiary">
          {ar.dashboard.movers.expensesPeriod}
        </span>
      }
    >
      {rows.length === 0 ? (
        <QuietEmpty variant="chart" caption={ar.dashboard.movers.expensesHint} />
      ) : (
        <div className="space-y-4">
          <p className="text-2xl font-semibold text-foreground tabular-num" dir="ltr">
            {fmtMoney(total)}{' '}
            <span className="text-sm text-foreground-tertiary">ج.م</span>
          </p>
          <div
            className="h-3 rounded-full bg-border-subtle overflow-hidden flex"
            dir="ltr"
          >
            {rows.map((r) => {
              const pct = total ? (r.total / total) * 100 : 0;
              return (
                <div
                  key={r.key}
                  className="h-full first:rounded-s-full last:rounded-e-full"
                  style={{ width: `${pct}%`, background: r.color }}
                  title={`${r.label}: ${fmtMoney(r.total)} ج.م`}
                />
              );
            })}
          </div>
          <ul className="grid grid-cols-2 gap-2 text-xs">
            {rows.map((r) => {
              const pct = total ? Math.round((r.total / total) * 100) : 0;
              return (
                <li key={r.key} className="flex items-center gap-2">
                  <span
                    className="size-2 rounded-sm shrink-0"
                    style={{ background: r.color }}
                    aria-hidden
                  />
                  <span className="flex-1 text-foreground truncate">{r.label}</span>
                  <span dir="ltr" className="tabular-num text-foreground-tertiary">
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </WidgetCard>
  );
}
