import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ar } from '@/i18n/ar';
import { CHART_PALETTE } from '@/pages/reports/SecondaryReportChart';
import { WidgetCard } from './states';
import { cairoCurrentHour, fmtInt, fmtMoney } from './format';
import type { HourlySalesRow } from '@/lib/owner-api';

/* 24-hour sales histogram. Always renders 24 bars; the current Cairo hour
 * is rendered in `--rmx-accent` (the dashboard's single focal accent). */
export function HourlyCurveCard({ rows }: { rows: HourlySalesRow[] }) {
  const currentHour = useMemo(cairoCurrentHour, []);

  const data = useMemo(() => {
    const byHour = new Map<number, HourlySalesRow>();
    for (const r of rows) byHour.set(r.hour, r);
    return Array.from({ length: 24 }, (_, h) => {
      const r = byHour.get(h);
      return {
        hour: h,
        label: String(h).padStart(2, '0'),
        revenue: r ? Number(r.revenue_egp) || 0 : 0,
        count: r ? Number(r.count) || 0 : 0,
      };
    });
  }, [rows]);

  const hasAnyData = data.some((d) => d.revenue > 0 || d.count > 0);

  return (
    <WidgetCard title={ar.dashboard.trends.hourlyTitle}>
      <div className="w-full h-48" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid stroke={CHART_PALETTE.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: CHART_PALETTE.axis }}
              stroke={CHART_PALETTE.grid}
              interval={2}
            />
            <YAxis
              tick={{ fontSize: 10, fill: CHART_PALETTE.axis }}
              stroke={CHART_PALETTE.grid}
              width={48}
              tickFormatter={(v) =>
                Number(v).toLocaleString('en-EG', { maximumFractionDigits: 0 })
              }
            />
            <Tooltip
              cursor={{ fill: CHART_PALETTE.grid, opacity: 0.4 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const datum = payload[0].payload as (typeof data)[number];
                return (
                  <div
                    dir="rtl"
                    className="rounded-md border border-border-subtle bg-surface-elevated shadow-lg p-2.5 text-xs"
                  >
                    <p className="font-medium text-foreground mb-1">
                      {ar.dashboard.trends.hourlyAxisHour}{' '}
                      <span dir="ltr" className="tabular-num">
                        {datum.label}:00
                      </span>
                    </p>
                    <p className="text-foreground-muted">
                      {ar.dashboard.trends.hourlyAxisRevenue}:{' '}
                      <span dir="ltr" className="tabular-num font-medium text-foreground">
                        {fmtMoney(datum.revenue)} ج.م
                      </span>
                    </p>
                    <p className="text-foreground-muted">
                      <span dir="ltr" className="tabular-num font-medium text-foreground">
                        {fmtInt(datum.count)}
                      </span>{' '}
                      فاتورة
                    </p>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="revenue"
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell
                  key={d.hour}
                  fill={
                    d.hour === currentHour
                      ? CHART_PALETTE.primary
                      : d.revenue > 0
                        ? CHART_PALETTE.tertiary
                        : CHART_PALETTE.grid
                  }
                  fillOpacity={d.hour === currentHour ? 1 : d.revenue > 0 ? 0.7 : 0.5}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {!hasAnyData && (
        <p className="text-xs text-foreground-tertiary mt-2 text-center">
          {ar.dashboard.trends.hourlyHint}
        </p>
      )}
    </WidgetCard>
  );
}
