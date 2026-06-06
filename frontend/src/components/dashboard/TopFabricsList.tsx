import { useMemo } from 'react';
import { ar } from '@/i18n/ar';
import { WidgetCard } from './states';
import { QuietEmpty } from './QuietEmpty';
import { PeriodChip, type Period } from './PeriodChip';
import { fmtInt, fmtMoney } from './format';
import type { TopFabricRow } from '@/lib/owner-api';

/* Top fabrics list with intra-row mini bars. No recharts — flexbox + a
 * div with width: % gives the visual without extra surface noise. */
export function TopFabricsList({
  rows,
  period,
  onPeriodChange,
}: {
  rows: TopFabricRow[];
  period: Period;
  onPeriodChange: (p: Period) => void;
}) {
  const maxRevenue = useMemo(
    () => rows.reduce((m, r) => Math.max(m, Number(r.revenue_egp) || 0), 0),
    [rows],
  );

  return (
    <WidgetCard
      title={ar.dashboard.movers.topFabricsTitle}
      action={<PeriodChip value={period} onChange={onPeriodChange} />}
    >
      {rows.length === 0 ? (
        <QuietEmpty variant="list" caption={ar.dashboard.movers.topFabricsHint} />
      ) : (
        <ul className="space-y-2.5">
          {rows.slice(0, 10).map((r, i) => {
            const revenue = Number(r.revenue_egp) || 0;
            const pct = maxRevenue ? Math.round((revenue / maxRevenue) * 100) : 0;
            return (
              <li key={`${r.fabric_id}-${r.color_id}`} className="space-y-1">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="text-foreground-tertiary tabular-num w-5" dir="ltr">
                    {i + 1}.
                  </span>
                  <span className="flex-1 text-foreground truncate">
                    {r.fabric_name_ar}{' '}
                    <span className="text-foreground-tertiary text-xs">
                      ({r.color_name_ar})
                    </span>
                  </span>
                  <span
                    dir="ltr"
                    className="tabular-num text-foreground font-medium"
                  >
                    {fmtMoney(revenue)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="h-1.5 flex-1 rounded-full bg-border-subtle overflow-hidden"
                    dir="ltr"
                  >
                    <div
                      className="h-full bg-accent rounded-full transition-[width] duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span dir="ltr" className="text-xs text-foreground-tertiary tabular-num w-10 text-end">
                    {fmtInt(r.roll_count)} توب
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
