import { ar } from '@/i18n/ar';
import { WidgetCard } from './states';
import { PeriodChip, type Period } from './PeriodChip';
import { fmtInt } from './format';
import { useTickUp } from './useTickUp';
import type { InventoryTurnover } from '@/lib/owner-api';

export function TurnoverStat({
  period,
  onPeriodChange,
  data,
}: {
  period: Period;
  onPeriodChange: (p: Period) => void;
  data: InventoryTurnover | null | undefined;
}) {
  const ratio = data?.turnover_ratio ?? 0;
  const sold = data?.sold_rolls ?? 0;
  const animated = useTickUp(ratio);
  const showDash = !data || data.turnover_ratio == null;

  return (
    <WidgetCard
      title={ar.dashboard.trends.turnoverTitle}
      action={<PeriodChip value={period} onChange={onPeriodChange} />}
    >
      <div className="flex items-baseline gap-2 tabular-num">
        <span
          dir="ltr"
          className="text-4xl font-semibold text-foreground"
        >
          {showDash ? '—' : animated.toFixed(2)}
        </span>
        {!showDash && <span className="text-sm text-foreground-tertiary">×</span>}
      </div>
      {showDash ? (
        <p className="text-xs text-foreground-tertiary mt-3">
          {ar.dashboard.trends.turnoverHint}
        </p>
      ) : (
        <p className="text-xs text-foreground-tertiary mt-3">
          <span dir="ltr" className="tabular-num text-foreground font-medium">
            {fmtInt(sold)}
          </span>{' '}
          {ar.dashboard.trends.turnoverSold}
          <span className="mx-2 text-border-strong">·</span>
          <span dir="ltr" className="tabular-num text-foreground font-medium">
            {fmtInt(data?.current_in_stock ?? 0)}
          </span>{' '}
          {ar.dashboard.trends.turnoverInStock}
        </p>
      )}
    </WidgetCard>
  );
}
