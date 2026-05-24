import { ar } from '@/i18n/ar';
import { StatusPill } from '@/components/StatusPill';
import { WidgetCard } from './states';
import { EGP, fmtInt, fmtMoney } from './format';
import type { CashPosition } from '@/lib/owner-api';

/* Two-up tile group: cash drawer + total bank balance, each with a
 * StatusPill for last reconciliation status. */
export function CashAndBankStrip({ data }: { data: CashPosition }) {
  const totalBank = data.banks.reduce((s, b) => s + b.current_balance_egp, 0);
  const activeBanks = data.banks.filter((b) => b.is_active).length;
  const cashRecon = data.cash.last_recon_date;
  const cashVar = data.cash.last_recon_variance;

  return (
    <WidgetCard title={ar.dashboard.pulse.cashAndBank}>
      <div className="grid grid-cols-2 gap-4">
        <BalanceTile
          label={ar.dashboard.pulse.drawer}
          value={data.cash.current_balance_egp}
          pill={
            cashRecon ? (
              <StatusPill
                tone={
                  cashVar == null || Math.abs(cashVar) < 0.01
                    ? 'success'
                    : Math.abs(cashVar) < 10
                      ? 'warning'
                      : 'danger'
                }
              >
                {ar.dashboard.pulse.lastRecon}: {cashRecon}
              </StatusPill>
            ) : (
              <StatusPill tone="neutral">{ar.dashboard.pulse.noRecon}</StatusPill>
            )
          }
        />
        <BalanceTile
          label={ar.dashboard.pulse.banks}
          value={totalBank}
          pill={
            <StatusPill tone="info">
              <span dir="ltr" className="tabular-num">
                {fmtInt(activeBanks)}
              </span>
              <span className="ms-1">{ar.dashboard.pulse.banksActive}</span>
            </StatusPill>
          }
        />
      </div>
    </WidgetCard>
  );
}

function BalanceTile({
  label,
  value,
  pill,
}: {
  label: string;
  value: number;
  pill: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
        {label}
      </p>
      <div className="flex items-baseline gap-1.5 tabular-num">
        <span className="text-2xl font-semibold text-foreground" dir="ltr">
          {fmtMoney(value)}
        </span>
        <span className="text-xs text-foreground-tertiary">{EGP}</span>
      </div>
      <div>{pill}</div>
    </div>
  );
}
