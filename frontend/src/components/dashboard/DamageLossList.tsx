import { ar } from '@/i18n/ar';
import { WidgetCard } from './states';
import { QuietEmpty } from './QuietEmpty';
import { fmtInt, fmtMoney } from './format';
import type { DamageLossSummary } from '@/lib/owner-api';

export function DamageLossList({ data }: { data: DamageLossSummary }) {
  const labels = ar.damage.reasons;
  const rows = data.by_reason
    .map((r) => ({
      ...r,
      label: labels[r.reason_code as keyof typeof labels] ?? r.reason_code,
    }))
    .filter((r) => r.event_count > 0);

  return (
    <WidgetCard title={ar.dashboard.movers.damageTitle}>
      {rows.length === 0 ? (
        <QuietEmpty variant="list" caption={ar.dashboard.movers.damageHint} />
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const isTheft = r.reason_code === 'loss_theft';
            return (
              <li key={r.reason_code} className="flex items-baseline gap-3 text-sm">
                <span
                  className={
                    'size-2 rounded-full shrink-0 ' +
                    (isTheft ? 'bg-danger' : 'bg-warning')
                  }
                  aria-hidden
                />
                <span className="flex-1 text-foreground">{r.label}</span>
                <span dir="ltr" className="tabular-num text-foreground-tertiary">
                  {fmtInt(r.event_count)}
                </span>
                <span
                  dir="ltr"
                  className="tabular-num text-foreground font-medium w-28 text-end"
                >
                  {fmtMoney(r.total_valuation_egp)} ج.م
                </span>
              </li>
            );
          })}
          <li className="border-t border-border-subtle pt-2 mt-1 flex items-baseline gap-3 text-sm">
            <span className="flex-1 text-foreground-muted">الإجمالي</span>
            <span
              dir="ltr"
              className="tabular-num text-foreground font-semibold"
            >
              {fmtMoney(data.grand_total_egp)} ج.م
            </span>
          </li>
        </ul>
      )}
    </WidgetCard>
  );
}
