import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { motion } from 'framer-motion';
import { ar } from '@/i18n/ar';

/**
 * Chart palette mapped from design-system tokens.
 * Kept in sync with `frontend/src/index.css` Warm Editorial palette.
 *   primary   = accent (terracotta)
 *   secondary = success (sage)
 *   tertiary  = info (muted blue)
 *   neutral   = border-strong
 */
export const CHART_PALETTE = {
  primary: '#C4624A',
  secondary: '#7C9472',
  tertiary: '#4F6B8E',
  neutral: '#B8A88F',
  axis: '#5C6678', // text-muted
  grid: '#E8DFD2', // border-subtle
  surface: '#FFFFFF',
  text: '#1A2433',
  danger: '#B83B3B',
  warning: '#D89B3A',
} as const;

const SERIES_COLORS = [
  CHART_PALETTE.primary,
  CHART_PALETTE.secondary,
  CHART_PALETTE.tertiary,
  CHART_PALETTE.warning,
  CHART_PALETTE.neutral,
];

const fmtNumber = (n: number) =>
  Number(n).toLocaleString('en-EG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const fmtCurrency = (n: number) =>
  `${Number(n).toLocaleString('en-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ج.م`;

type TooltipPayloadEntry = {
  name?: string | number;
  value?: string | number;
  color?: string;
};

type TooltipProps = {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  isCurrency?: boolean;
};

/**
 * Token-styled tooltip. Recharts positions it automatically — under RTL the
 * default anchor (right/left of cursor) is mirrored via the chart container's
 * `dir` attribute on the parent.
 */
function TokenTooltip({ active, payload, label, isCurrency }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      dir="rtl"
      className="rounded-md border border-border-subtle bg-surface-elevated shadow-lg p-2.5 text-xs"
      style={{ minWidth: 120 }}
    >
      {label && (
        <p className="font-medium text-foreground mb-1">{label}</p>
      )}
      <ul className="space-y-1">
        {payload.map((p, i) => (
          <li key={i} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-sm shrink-0"
                style={{ background: p.color }}
                aria-hidden
              />
              <span className="text-foreground-muted">{p.name}</span>
            </span>
            <span className="font-semibold tabular-num text-foreground" dir="ltr">
              {typeof p.value === 'number'
                ? isCurrency
                  ? fmtCurrency(p.value)
                  : fmtNumber(p.value)
                : p.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type ChartDatum = {
  name: string;
  value: number;
  value2?: number;
};

type ChartType = 'bar' | 'horizontalBar' | 'line' | 'pie';

type Props = {
  type: ChartType;
  data: ChartDatum[];
  title?: string;
  /** Suffix label for the primary value (e.g. "ج.م", "كجم"). */
  unit?: string;
  /** Label rendered above the X axis (line/bar). */
  xAxisLabel?: string;
  /** Series label (legend/tooltip). Default: "القيمة". */
  seriesLabel?: string;
  /** When true, formats values with currency suffix in tooltip. */
  isCurrency?: boolean;
};

/**
 * 600ms ease-out-cubic draw-in is provided by Recharts' built-in animation;
 * we also wrap the container in framer-motion fade-in for synced entry.
 */
export function SecondaryReportChart({
  type,
  data,
  title,
  xAxisLabel,
  seriesLabel = 'القيمة',
  isCurrency = false,
}: Props) {
  const safeData = useMemo(() => data.filter((d) => Number.isFinite(d.value)), [data]);

  if (safeData.length === 0) {
    return (
      <div className="text-center py-10 text-foreground-muted text-sm">
        {ar.reports.noData}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
      className="space-y-2"
    >
      {title && (
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      )}
      <div className="w-full h-64" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'pie' ? (
            <PieChart>
              <Pie
                data={safeData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius="80%"
                innerRadius="50%"
                paddingAngle={2}
                isAnimationActive
                animationDuration={600}
                animationEasing="ease-out"
              >
                {safeData.map((_, i) => (
                  <Cell
                    key={i}
                    fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                    stroke={CHART_PALETTE.surface}
                    strokeWidth={2}
                  />
                ))}
              </Pie>
              <Tooltip content={<TokenTooltip isCurrency={isCurrency} />} />
              <Legend
                wrapperStyle={{ fontSize: 12, color: CHART_PALETTE.text }}
                formatter={(v) => <span className="text-foreground">{v}</span>}
              />
            </PieChart>
          ) : type === 'line' ? (
            <LineChart data={safeData} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid stroke={CHART_PALETTE.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: CHART_PALETTE.axis }}
                stroke={CHART_PALETTE.grid}
                label={
                  xAxisLabel
                    ? { value: xAxisLabel, position: 'insideBottom', offset: -2, fontSize: 11, fill: CHART_PALETTE.axis }
                    : undefined
                }
              />
              <YAxis
                tick={{ fontSize: 11, fill: CHART_PALETTE.axis }}
                stroke={CHART_PALETTE.grid}
                tickFormatter={(v) => fmtNumber(Number(v))}
              />
              <Tooltip content={<TokenTooltip isCurrency={isCurrency} />} />
              <Line
                type="monotone"
                dataKey="value"
                name={seriesLabel}
                stroke={CHART_PALETTE.primary}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_PALETTE.primary }}
                activeDot={{ r: 5, fill: CHART_PALETTE.primary }}
                isAnimationActive
                animationDuration={600}
                animationEasing="ease-out"
              />
            </LineChart>
          ) : type === 'horizontalBar' ? (
            <BarChart
              data={safeData}
              layout="vertical"
              margin={{ top: 8, right: 16, bottom: 8, left: 80 }}
            >
              <CartesianGrid stroke={CHART_PALETTE.grid} strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: CHART_PALETTE.axis }}
                stroke={CHART_PALETTE.grid}
                tickFormatter={(v) => fmtNumber(Number(v))}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: CHART_PALETTE.axis }}
                stroke={CHART_PALETTE.grid}
                width={120}
              />
              <Tooltip content={<TokenTooltip isCurrency={isCurrency} />} />
              <Bar
                dataKey="value"
                name={seriesLabel}
                fill={CHART_PALETTE.primary}
                radius={[0, 4, 4, 0]}
                isAnimationActive
                animationDuration={600}
                animationEasing="ease-out"
              />
            </BarChart>
          ) : (
            <BarChart data={safeData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid stroke={CHART_PALETTE.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: CHART_PALETTE.axis }}
                stroke={CHART_PALETTE.grid}
              />
              <YAxis
                tick={{ fontSize: 11, fill: CHART_PALETTE.axis }}
                stroke={CHART_PALETTE.grid}
                tickFormatter={(v) => fmtNumber(Number(v))}
              />
              <Tooltip content={<TokenTooltip isCurrency={isCurrency} />} />
              {safeData.some((d) => d.value2 !== undefined) && <Legend wrapperStyle={{ fontSize: 12 }} />}
              <Bar
                dataKey="value"
                name={seriesLabel}
                fill={CHART_PALETTE.primary}
                radius={[4, 4, 0, 0]}
                isAnimationActive
                animationDuration={600}
                animationEasing="ease-out"
              />
              {safeData.some((d) => d.value2 !== undefined) && (
                <Bar
                  dataKey="value2"
                  fill={CHART_PALETTE.tertiary}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive
                  animationDuration={600}
                  animationEasing="ease-out"
                />
              )}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
