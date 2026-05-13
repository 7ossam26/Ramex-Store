import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ar } from '@/i18n/ar';
import { CHART_PALETTE } from '@/pages/reports/SecondaryReportChart';
import { WidgetCard } from './states';
import { fmtMoney, num } from './format';
import type { DailyTotalRow } from '@/lib/owner-api';

/* Last 14 days: revenue (filled area, accent) + net (line, info).
 * Soft gradient under primary series. */
export function RevenueTrendCard({ rows }: { rows: DailyTotalRow[] }) {
  const data = useMemo(() => {
    return rows.map((r) => {
      const d = r.date.slice(5).replace('-', '/');
      return {
        label: d,
        revenue: num(r.revenue_egp),
        net: num(r.net_egp),
      };
    });
  }, [rows]);

  const hasData = data.some((d) => d.revenue > 0);

  return (
    <WidgetCard title={ar.dashboard.trends.revenue14}>
      <div className="w-full h-56" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
            <defs>
              <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_PALETTE.primary} stopOpacity={0.25} />
                <stop offset="100%" stopColor={CHART_PALETTE.primary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART_PALETTE.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: CHART_PALETTE.axis }}
              stroke={CHART_PALETTE.grid}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: CHART_PALETTE.axis }}
              stroke={CHART_PALETTE.grid}
              width={56}
              tickFormatter={(v) =>
                Number(v).toLocaleString('en-EG', { maximumFractionDigits: 0 })
              }
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div
                    dir="rtl"
                    className="rounded-md border border-border-subtle bg-surface-elevated shadow-lg p-2.5 text-xs"
                  >
                    <p className="font-medium text-foreground mb-1" dir="ltr">
                      {label}
                    </p>
                    {payload.map((p, i) => (
                      <p key={i} className="text-foreground-muted">
                        <span
                          className="inline-block size-2 rounded-sm me-1.5"
                          style={{ background: p.color }}
                          aria-hidden
                        />
                        {p.name}:{' '}
                        <span dir="ltr" className="tabular-num font-medium text-foreground">
                          {fmtMoney(Number(p.value))} ج.م
                        </span>
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(v) => <span className="text-foreground">{v}</span>}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              name={ar.dashboard.trends.seriesRevenue}
              stroke={CHART_PALETTE.primary}
              strokeWidth={2}
              fill="url(#revGradient)"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="net"
              name={ar.dashboard.trends.seriesNet}
              stroke={CHART_PALETTE.tertiary}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {!hasData && (
        <p className="text-xs text-foreground-tertiary mt-2 text-center">
          {ar.dashboard.trends.revenue14Hint}
        </p>
      )}
    </WidgetCard>
  );
}
