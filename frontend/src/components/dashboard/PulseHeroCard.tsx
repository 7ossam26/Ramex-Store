import { ar } from '@/i18n/ar';
import { cn } from '@/lib/utils';
import { WidgetCard } from './states';
import { EGP, fmtMoney } from './format';
import { useTickUp } from './useTickUp';

/* Fold A hero: today's net cash flow, with inline mini split-bar showing
 * cash_in vs cash_out. Single focal accent — this is THE number for owners. */
export function PulseHeroCard({
  cashIn,
  cashOut,
}: {
  cashIn: number;
  cashOut: number;
}) {
  const net = cashIn - cashOut;
  const animated = useTickUp(net);
  const max = Math.max(cashIn, cashOut, 1);
  const inPct = Math.max(2, Math.round((cashIn / max) * 100));
  const outPct = Math.max(2, Math.round((cashOut / max) * 100));
  const noFlow = cashIn === 0 && cashOut === 0;

  const tone = net > 0 ? 'positive' : net < 0 ? 'negative' : 'neutral';

  return (
    <WidgetCard title={ar.dashboard.pulse.netCashTitle}>
      <div className="flex items-baseline gap-2 tabular-num">
        <span
          dir="ltr"
          className={cn(
            'text-4xl font-semibold',
            tone === 'positive' && 'text-accent',
            tone === 'negative' && 'text-danger-foreground',
            tone === 'neutral' && 'text-foreground-tertiary',
          )}
        >
          {noFlow ? '—' : fmtMoney(animated)}
        </span>
        {!noFlow && (
          <span className="text-sm text-foreground-tertiary">{EGP}</span>
        )}
      </div>

      {noFlow ? (
        <p className="text-xs text-foreground-tertiary mt-3">
          {ar.dashboard.pulse.netCashHint}
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-success-foreground">
              {ar.dashboard.pulse.cashIn}
              <span dir="ltr" className="ms-1.5 tabular-num font-medium">
                {fmtMoney(cashIn)}
              </span>
            </span>
            <span className="text-foreground-tertiary">
              {ar.dashboard.pulse.cashOut}
              <span dir="ltr" className="ms-1.5 tabular-num font-medium">
                {fmtMoney(cashOut)}
              </span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5" dir="ltr">
            <div className="h-2 rounded-full bg-success-subtle overflow-hidden">
              <div
                className="h-full bg-success rounded-full transition-[width] duration-300"
                style={{ width: `${inPct}%` }}
              />
            </div>
            <div className="h-2 rounded-full bg-danger-subtle overflow-hidden">
              <div
                className="h-full bg-danger rounded-full transition-[width] duration-300"
                style={{ width: `${outPct}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </WidgetCard>
  );
}
