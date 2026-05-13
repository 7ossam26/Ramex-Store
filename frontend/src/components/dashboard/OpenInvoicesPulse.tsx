import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronLeft } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { WidgetCard } from './states';
import { EGP, fmtInt, fmtMoney } from './format';
import type { OwnerOpenInvoiceRow } from '@/lib/owner-api';
import { cn } from '@/lib/utils';

/* Open invoices summary tile.
 * Shows count + total balance + worst-aged invoice. Healthy zero state uses
 * a sage check icon (calm, not alarming). Stale invoices surface an amber dot. */
export function OpenInvoicesPulse({
  rows,
  staleThresholdDays = 7,
}: {
  rows: OwnerOpenInvoiceRow[];
  staleThresholdDays?: number;
}) {
  const count = rows.length;
  const totalBalance = rows.reduce((s, r) => s + Number(r.balance_egp ?? 0), 0);
  const oldest = rows.reduce<number>((max, r) => Math.max(max, r.age_days ?? 0), 0);
  const hasStale = rows.some((r) => (r.age_days ?? 0) > staleThresholdDays);

  if (count === 0) {
    return (
      <WidgetCard title={ar.dashboard.pulse.openInvoicesTitle}>
        <div className="flex items-center gap-3 py-2">
          <CheckCircle2 className="size-8 text-success shrink-0" aria-hidden />
          <div>
            <p className="text-sm text-foreground">{ar.dashboard.pulse.openInvoicesHint}</p>
          </div>
        </div>
      </WidgetCard>
    );
  }

  return (
    <WidgetCard
      title={ar.dashboard.pulse.openInvoicesTitle}
      action={
        <Link
          to="/invoices?status=open"
          className="text-xs text-foreground-muted hover:text-accent inline-flex items-center gap-1"
        >
          {ar.dashboard.seller.viewAll}
          <ChevronLeft className="size-3.5" aria-hidden />
        </Link>
      }
    >
      <div className="flex items-baseline gap-2 tabular-num">
        <span className="text-3xl font-semibold text-foreground" dir="ltr">
          {fmtInt(count)}
        </span>
        <span className="text-sm text-foreground-tertiary">فاتورة</span>
        {hasStale && (
          <span
            className={cn(
              'inline-flex items-center gap-1 ms-2 px-2 py-0.5 rounded-pill',
              'bg-warning-subtle text-warning-foreground text-xs font-medium',
            )}
          >
            <span className="size-1.5 rounded-full bg-warning" aria-hidden />
            {ar.dashboard.pulse.stalePill}
          </span>
        )}
      </div>
      <p className="text-xs text-foreground-tertiary mt-2">
        <span dir="ltr" className="tabular-num">
          {fmtMoney(totalBalance)} {EGP}
        </span>
        <span className="mx-2 text-border-strong">·</span>
        {ar.dashboard.pulse.openInvoicesAge}{' '}
        <span dir="ltr" className="tabular-num">
          {fmtInt(oldest)} {ar.dashboard.pulse.ageDays}
        </span>
      </p>
    </WidgetCard>
  );
}
