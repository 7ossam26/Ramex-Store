import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Banknote, Landmark, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { financeApi } from '@/lib/finance-api';
import { ar } from '@/i18n/ar';
import type {
  TreasuriesOverviewCashMovement,
  TreasuriesOverviewBankMovement,
  TreasuriesOverviewBankAccount,
} from '@/lib/finance-types';

function formatEgp(value: string | number): string {
  return `${Number(value).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function DirectionBadge({ direction, color }: { direction: 'in' | 'out'; color: 'green' | 'blue' }) {
  if (direction === 'in') {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${
        color === 'green' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
      }`}>
        <TrendingUp className="size-3" aria-hidden />
        داخل
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded bg-red-50 text-red-700">
      <TrendingDown className="size-3" aria-hidden />
      خارج
    </span>
  );
}

function CashMovementFeed({ movements }: { movements: TreasuriesOverviewCashMovement[] }) {
  const cashEventLabels = ar.cash.eventTypes as Record<string, string>;

  if (movements.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">{ar.treasuriesOverview.noMovements}</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {movements.map((m) => (
        <li key={m.id} className="py-2.5 flex items-start gap-3">
          <DirectionBadge direction={m.direction} color="green" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink">
                {cashEventLabels[m.event_type] ?? m.event_type}
              </span>
              <span className={`text-sm font-semibold tabular-nums ${
                m.direction === 'in' ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {m.direction === 'out' ? '−' : '+'}{formatEgp(m.amount_egp)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(m.created_at)}</p>
            {m.notes_ar && (
              <p className="text-xs text-muted-foreground truncate">{m.notes_ar}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function BankMovementFeed({ movements }: { movements: TreasuriesOverviewBankMovement[] }) {
  const bankEventLabels = ar.cash.bankEventTypes as Record<string, string>;

  if (movements.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">{ar.treasuriesOverview.noMovements}</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {movements.map((m) => (
        <li key={m.id} className="py-2.5 flex items-start gap-3">
          <DirectionBadge direction={m.direction} color="blue" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-ink">
                {bankEventLabels[m.event_type] ?? m.event_type}
                {m.bank_name_ar && (
                  <span className="text-muted-foreground font-normal"> · {m.bank_name_ar}</span>
                )}
              </span>
              <span className={`text-sm font-semibold tabular-nums ${
                m.direction === 'in' ? 'text-blue-600' : 'text-red-600'
              }`}>
                {m.direction === 'out' ? '−' : '+'}{formatEgp(m.amount_egp)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(m.created_at)}</p>
            {m.notes_ar && (
              <p className="text-xs text-muted-foreground truncate">{m.notes_ar}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function BankAccountCard({ account }: { account: TreasuriesOverviewBankAccount }) {
  return (
    <div className="rounded-md border border-border bg-canvas p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink truncate">{account.name_ar}</p>
          {account.bank_name_ar && (
            <p className="text-xs text-muted-foreground">{account.bank_name_ar}</p>
          )}
          {account.account_number_masked && (
            <p className="text-xs text-muted-foreground font-mono">{account.account_number_masked}</p>
          )}
        </div>
        <div className="text-left shrink-0">
          <p className="text-base font-bold text-blue-700 tabular-nums" dir="ltr">
            {formatEgp(account.balance_egp)}
          </p>
          {account.is_default && (
            <span className="text-[10px] bg-blue-100 text-blue-700 rounded px-1 py-0.5">
              {ar.treasuriesOverview.defaultBadge}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function TreasuriesOverviewPage() {
  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['treasuries-overview'],
    queryFn: () => financeApi.getTreasuriesOverview(),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">{ar.treasuriesOverview.title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{ar.treasuriesOverview.description}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              {ar.treasuriesOverview.lastUpdated}: {formatDateTime(new Date(dataUpdatedAt).toISOString())}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border bg-canvas hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50"
            aria-label={ar.treasuriesOverview.refresh}
          >
            <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />
            {ar.treasuriesOverview.refresh}
          </button>
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground py-10 text-center">{ar.treasuriesOverview.loading}</p>
      )}

      {isError && (
        <p className="text-sm text-red-600 py-10 text-center">{ar.treasuriesOverview.error}</p>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* ── Cash column ─────────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="size-7 rounded bg-emerald-100 inline-flex items-center justify-center">
                <Banknote className="size-4 text-emerald-700" aria-hidden />
              </span>
              <h2 className="text-base font-semibold text-ink">{ar.treasuriesOverview.cashSection}</h2>
            </div>

            {/* Balance card */}
            <div
              data-testid="cash-balance-card"
              className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4"
            >
              <p className="text-xs text-emerald-700 font-medium mb-1">{ar.treasuriesOverview.totalBalance}</p>
              <p className="text-3xl font-bold text-emerald-800 tabular-nums" dir="ltr">
                {formatEgp(data.cash.total_egp)}
              </p>
              {data.cash.by_branch.map((b) => (
                <p key={b.branch_id} className="text-xs text-emerald-600 mt-1.5">
                  {b.branch_name_ar}: {formatEgp(b.balance_egp)}
                </p>
              ))}
            </div>

            {/* Recent movements */}
            <div className="rounded-lg border border-border bg-canvas p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-ink">{ar.treasuriesOverview.recentMovements}</p>
                <Link
                  to="/cash"
                  className="text-xs text-primary hover:underline cursor-pointer"
                >
                  {ar.treasuriesOverview.viewAll}
                </Link>
              </div>
              <CashMovementFeed movements={data.cash.recent_movements} />
            </div>
          </div>

          {/* ── Bank column ─────────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="size-7 rounded bg-blue-100 inline-flex items-center justify-center">
                <Landmark className="size-4 text-blue-700" aria-hidden />
              </span>
              <h2 className="text-base font-semibold text-ink">{ar.treasuriesOverview.bankSection}</h2>
            </div>

            {/* Per-account cards */}
            <div className="space-y-2">
              {data.bank.by_account.map((acc) => (
                <BankAccountCard key={acc.bank_account_id} account={acc} />
              ))}
              {data.bank.by_account.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">{ar.treasuriesOverview.noMovements}</p>
              )}
            </div>

            {/* Total across all bank accounts */}
            {data.bank.by_account.length > 1 && (
              <div
                data-testid="bank-total-card"
                className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 flex items-center justify-between"
              >
                <p className="text-sm font-semibold text-blue-800">{ar.treasuriesOverview.totalBankBalance}</p>
                <p className="text-xl font-bold text-blue-800 tabular-nums" dir="ltr">
                  {formatEgp(data.bank.total_egp)}
                </p>
              </div>
            )}

            {/* Single bank account case — still render total card for testid */}
            {data.bank.by_account.length <= 1 && (
              <div
                data-testid="bank-total-card"
                className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 flex items-center justify-between"
              >
                <p className="text-sm font-semibold text-blue-800">{ar.treasuriesOverview.totalBankBalance}</p>
                <p className="text-xl font-bold text-blue-800 tabular-nums" dir="ltr">
                  {formatEgp(data.bank.total_egp)}
                </p>
              </div>
            )}

            {/* Recent bank movements */}
            <div className="rounded-lg border border-border bg-canvas p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-ink">{ar.treasuriesOverview.recentMovements}</p>
                <Link
                  to="/banks"
                  className="text-xs text-primary hover:underline cursor-pointer"
                >
                  {ar.treasuriesOverview.viewAll}
                </Link>
              </div>
              <BankMovementFeed movements={data.bank.recent_movements} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
