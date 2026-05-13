import { useMemo } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ar } from '@/i18n/ar';
import { CHART_PALETTE } from '@/pages/reports/SecondaryReportChart';
import { WidgetCard } from './states';
import { QuietEmpty } from './QuietEmpty';
import { fmtInt, fmtMoney } from './format';
import type { StockSummaryRow } from '@/lib/owner-api';

/* Aggregate roll-count by status across all warehouses. */
const STATUS_COLOR: Record<string, string> = {
  in_stock: CHART_PALETTE.secondary,
  reserved: CHART_PALETTE.warning,
  sold: CHART_PALETTE.tertiary,
  damaged: CHART_PALETTE.danger,
  sample: CHART_PALETTE.neutral,
  returned: CHART_PALETTE.primary,
  written_off: CHART_PALETTE.axis,
};

type Aggregated = {
  status: string;
  label: string;
  rolls: number;
  valuation: number;
  color: string;
};

export function StockHealthDonut({ rows }: { rows: StockSummaryRow[] }) {
  const stockLabels = ar.dashboard.trends.stockStatus;

  const data = useMemo<Aggregated[]>(() => {
    const byStatus = new Map<string, Aggregated>();
    for (const r of rows) {
      const key = r.status;
      const existing = byStatus.get(key);
      const rolls = Number(r.roll_count) || 0;
      const valuation = Number(r.total_valuation_egp) || 0;
      if (existing) {
        existing.rolls += rolls;
        existing.valuation += valuation;
      } else {
        byStatus.set(key, {
          status: key,
          label: stockLabels[key as keyof typeof stockLabels] ?? key,
          rolls,
          valuation,
          color: STATUS_COLOR[key] ?? CHART_PALETTE.neutral,
        });
      }
    }
    return Array.from(byStatus.values())
      .filter((d) => d.rolls > 0)
      .sort((a, b) => b.rolls - a.rolls);
  }, [rows, stockLabels]);

  const totalRolls = data.reduce((s, d) => s + d.rolls, 0);
  const totalValuation = data.reduce((s, d) => s + d.valuation, 0);

  return (
    <WidgetCard title={ar.dashboard.trends.stockTitle}>
      {data.length === 0 ? (
        <QuietEmpty variant="chart" caption={ar.dashboard.trends.stockHint} />
      ) : (
        <div className="grid grid-cols-5 gap-4 items-center">
          <div className="col-span-2 h-44" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="rolls"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius="90%"
                  innerRadius="60%"
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {data.map((d) => (
                    <Cell key={d.status} fill={d.color} stroke={CHART_PALETTE.surface} strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as Aggregated;
                    return (
                      <div
                        dir="rtl"
                        className="rounded-md border border-border-subtle bg-surface-elevated shadow-lg p-2 text-xs"
                      >
                        <p className="font-medium text-foreground">{d.label}</p>
                        <p className="text-foreground-muted mt-0.5">
                          <span dir="ltr" className="tabular-num font-medium text-foreground">
                            {fmtInt(d.rolls)}
                          </span>{' '}
                          {ar.dashboard.trends.stockRolls}
                        </p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="col-span-3 space-y-1.5 text-xs">
            {data.map((d) => {
              const pct = totalRolls ? Math.round((d.rolls / totalRolls) * 100) : 0;
              return (
                <li key={d.status} className="flex items-center gap-2.5">
                  <span
                    className="size-2.5 rounded-sm shrink-0"
                    style={{ background: d.color }}
                    aria-hidden
                  />
                  <span className="flex-1 text-foreground">{d.label}</span>
                  <span dir="ltr" className="tabular-num text-foreground font-medium">
                    {fmtInt(d.rolls)}
                  </span>
                  <span dir="ltr" className="tabular-num text-foreground-tertiary w-8 text-end">
                    {pct}%
                  </span>
                </li>
              );
            })}
            <li className="border-t border-border-subtle pt-2 mt-2 flex items-center gap-2.5">
              <span className="flex-1 text-foreground-muted">
                {ar.dashboard.trends.stockValuation}
              </span>
              <span dir="ltr" className="tabular-num text-foreground font-semibold">
                {fmtMoney(totalValuation)} ج.م
              </span>
            </li>
          </ul>
        </div>
      )}
    </WidgetCard>
  );
}
