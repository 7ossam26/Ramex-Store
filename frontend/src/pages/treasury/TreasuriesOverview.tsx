import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { RefreshCw, Banknote, Landmark, TrendingDown, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { financeApi } from '@/lib/finance-api';
import { ar } from '@/i18n/ar';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Skeleton } from '@/components/Skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  TreasuriesOverviewCashMovement,
  TreasuriesOverviewBankMovement,
  TreasuriesOverviewBankAccount,
} from '@/lib/finance-types';

const formatEgp = (value: string | number) =>
  Number(value).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

/**
 * Tick-up: animates a numeric value from 0 to target over `duration` ms using
 * ease-out-cubic. Skips animation when value is 0 or prefers-reduced-motion is set.
 */
function useTickUp(target: number, duration = 600): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (target === 0) {
      setValue(0);
      return;
    }
    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setValue(target);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out-cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

function BalanceValue({ amount }: { amount: string | number }) {
  const target = Number(amount);
  const animated = useTickUp(target);
  return (
    <span className="tabular-num" dir="ltr">
      {formatEgp(animated)}
    </span>
  );
}

/**
 * Inline sparkline: derives a smooth path from recent movement amounts.
 * Falls back to a flat line if fewer than 2 points.
 * 600ms accent draw-in respecting reduced motion.
 */
function Sparkline({ points, accent = 'accent' }: { points: number[]; accent?: 'accent' | 'info' }) {
  const width = 96;
  const height = 28;
  const padding = 2;
  const series = points.length >= 2 ? points : [0, 0];
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const stepX = (width - padding * 2) / Math.max(1, series.length - 1);
  const path = series
    .map((v, i) => {
      const x = padding + i * stepX;
      const y = height - padding - ((v - min) / range) * (height - padding * 2);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  const stroke = accent === 'info' ? 'text-info' : 'text-accent';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('shrink-0', stroke)}
      aria-hidden
    >
      <motion.path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, ease: [0, 0, 0.2, 1] }}
      />
    </svg>
  );
}

function DirectionPill({ direction, tone }: { direction: 'in' | 'out'; tone: 'success' | 'info' }) {
  if (direction === 'in') {
    const cls = tone === 'success'
      ? 'bg-success-subtle text-success-foreground'
      : 'bg-info-subtle text-info-foreground';
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-medium', cls)}>
        <TrendingUp className="size-3" aria-hidden />
        {ar.treasuriesOverview.inbound}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-medium bg-danger-subtle text-danger-foreground">
      <TrendingDown className="size-3" aria-hidden />
      {ar.treasuriesOverview.outbound}
    </span>
  );
}

function MovementFeed({
  movements,
  tone,
  showBank = false,
}: {
  movements: (TreasuriesOverviewCashMovement | TreasuriesOverviewBankMovement)[];
  tone: 'success' | 'info';
  showBank?: boolean;
}) {
  const cashLabels = ar.cash.eventTypes as Record<string, string>;
  const bankLabels = ar.cash.bankEventTypes as Record<string, string>;

  if (movements.length === 0) {
    return (
      <p className="text-sm text-foreground-muted py-6 text-center">
        {ar.treasuriesOverview.noMovements}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border-subtle">
      {movements.map((m) => {
        const label = (showBank ? bankLabels : cashLabels)[m.event_type] ?? m.event_type;
        const bankName = showBank ? (m as TreasuriesOverviewBankMovement).bank_name_ar : null;
        return (
          <li key={m.id} className="py-2.5 flex items-start gap-3">
            <DirectionPill direction={m.direction} tone={tone} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground truncate">
                  {label}
                  {bankName && (
                    <span className="text-foreground-muted font-normal"> · {bankName}</span>
                  )}
                </span>
                <span
                  className={cn(
                    'text-sm font-semibold tabular-num',
                    m.direction === 'in'
                      ? tone === 'success' ? 'text-success-foreground' : 'text-info-foreground'
                      : 'text-danger-foreground',
                  )}
                  dir="ltr"
                >
                  {m.direction === 'out' ? '−' : '+'}
                  {formatEgp(m.amount_egp)}
                </span>
              </div>
              <p className="text-xs text-foreground-tertiary mt-0.5">{formatDateTime(m.created_at)}</p>
              {m.notes_ar && (
                <p className="text-xs text-foreground-muted truncate">{m.notes_ar}</p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function BankAccountCard({ account }: { account: TreasuriesOverviewBankAccount }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-elevated p-4 shadow-sm hover:shadow-md transition-shadow duration-150">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{account.name_ar}</p>
          {account.bank_name_ar && (
            <p className="text-xs text-foreground-muted">{account.bank_name_ar}</p>
          )}
          {account.account_number_masked && (
            <p className="text-xs text-foreground-tertiary tabular-num" dir="ltr">
              {account.account_number_masked}
            </p>
          )}
        </div>
        <div className="text-left shrink-0">
          <p className="text-xl font-semibold text-foreground tabular-num" dir="ltr">
            {formatEgp(account.balance_egp)}
          </p>
          {account.is_default && (
            <span className="text-[10px] bg-accent-subtle text-accent rounded-pill px-2 py-0.5 inline-block mt-1">
              {ar.treasuriesOverview.defaultBadge}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Cards animate in on mount with a 60ms stagger.
const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: [0, 0, 0.2, 1] as const } },
};

export function TreasuriesOverviewPage() {
  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['treasuries-overview'],
    queryFn: () => financeApi.getTreasuriesOverview(),
    staleTime: 30_000,
  });

  // Build a sparkline series from recent_movements (signed amounts, oldest → newest).
  const cashSeries = data?.cash.recent_movements
    .slice()
    .reverse()
    .map((m) => (m.direction === 'in' ? 1 : -1) * Number(m.amount_egp)) ?? [];
  const bankSeries = data?.bank.recent_movements
    .slice()
    .reverse()
    .map((m) => (m.direction === 'in' ? 1 : -1) * Number(m.amount_egp)) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={ar.treasuriesOverview.title}
        description={ar.treasuriesOverview.description}
        actions={
          <>
            {dataUpdatedAt > 0 && (
              <span className="text-xs text-foreground-tertiary hidden sm:block">
                {ar.treasuriesOverview.lastUpdated}: {formatDateTime(new Date(dataUpdatedAt).toISOString())}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label={ar.treasuriesOverview.refresh}
              className="gap-1.5"
            >
              <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} aria-hidden />
              {ar.treasuriesOverview.refresh}
            </Button>
          </>
        }
      />

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-border-subtle bg-surface-elevated p-5 shadow-sm space-y-3"
              aria-hidden
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <ErrorBanner
          title={ar.treasuriesOverview.error}
          onRetry={() => refetch()}
        />
      )}

      {data && (
        <motion.div
          variants={gridVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 gap-5"
        >
          {/* ── Cash column ─────────────────────────────────────────── */}
          <motion.div variants={itemVariants} className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="size-7 rounded-md bg-success-subtle inline-flex items-center justify-center">
                <Banknote className="size-4 text-success-foreground" aria-hidden />
              </span>
              <h2 className="text-base font-semibold text-foreground">
                {ar.treasuriesOverview.cashSection}
              </h2>
            </div>

            {/* Balance card */}
            <div
              data-testid="cash-balance-card"
              className="rounded-lg border border-border-subtle bg-surface-elevated p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted mb-1">
                    {ar.treasuriesOverview.totalBalance}
                  </p>
                  <p className="text-4xl font-semibold text-foreground tabular-num leading-none" dir="ltr">
                    <BalanceValue amount={data.cash.total_egp} />
                  </p>
                  <p className="text-xs text-foreground-tertiary mt-1.5">ج.م</p>
                </div>
                {cashSeries.length >= 2 && (
                  <div className="text-right">
                    <Sparkline points={cashSeries} accent="accent" />
                    <p className="text-[10px] text-foreground-tertiary mt-1">
                      {ar.treasuriesOverview.sparklineCaption}
                    </p>
                  </div>
                )}
              </div>
              {data.cash.by_branch.length > 0 && (
                <dl className="mt-4 pt-4 border-t border-border-subtle space-y-1.5">
                  {data.cash.by_branch.map((b) => (
                    <div key={b.branch_id} className="flex items-center justify-between text-xs">
                      <dt className="text-foreground-muted">{b.branch_name_ar}</dt>
                      <dd className="text-foreground tabular-num" dir="ltr">
                        {formatEgp(b.balance_egp)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            {/* Recent movements */}
            <div className="rounded-lg border border-border-subtle bg-surface-elevated p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-foreground">
                  {ar.treasuriesOverview.recentMovements}
                </p>
                <Link
                  to="/cash"
                  className="text-xs text-accent hover:text-accent-hover transition-colors duration-150 cursor-pointer"
                >
                  {ar.treasuriesOverview.viewAll}
                </Link>
              </div>
              <MovementFeed movements={data.cash.recent_movements} tone="success" />
            </div>
          </motion.div>

          {/* ── Bank column ─────────────────────────────────────────── */}
          <motion.div variants={itemVariants} className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="size-7 rounded-md bg-info-subtle inline-flex items-center justify-center">
                <Landmark className="size-4 text-info-foreground" aria-hidden />
              </span>
              <h2 className="text-base font-semibold text-foreground">
                {ar.treasuriesOverview.bankSection}
              </h2>
            </div>

            {/* Total bank balance card */}
            <div
              data-testid="bank-total-card"
              className="rounded-lg border border-border-subtle bg-surface-elevated p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted mb-1">
                    {ar.treasuriesOverview.totalBankBalance}
                  </p>
                  <p className="text-4xl font-semibold text-foreground tabular-num leading-none" dir="ltr">
                    <BalanceValue amount={data.bank.total_egp} />
                  </p>
                  <p className="text-xs text-foreground-tertiary mt-1.5">ج.م</p>
                </div>
                {bankSeries.length >= 2 && (
                  <div className="text-right">
                    <Sparkline points={bankSeries} accent="info" />
                    <p className="text-[10px] text-foreground-tertiary mt-1">
                      {ar.treasuriesOverview.sparklineCaption}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Per-account cards */}
            <div className="space-y-2">
              {data.bank.by_account.map((acc) => (
                <BankAccountCard key={acc.bank_account_id} account={acc} />
              ))}
              {data.bank.by_account.length === 0 && (
                <EmptyState
                  title={ar.treasuriesOverview.noMovements}
                  icon={Landmark}
                  bordered
                />
              )}
            </div>

            {/* Recent bank movements */}
            <div className="rounded-lg border border-border-subtle bg-surface-elevated p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-foreground">
                  {ar.treasuriesOverview.recentMovements}
                </p>
                <Link
                  to="/banks"
                  className="text-xs text-accent hover:text-accent-hover transition-colors duration-150 cursor-pointer"
                >
                  {ar.treasuriesOverview.viewAll}
                </Link>
              </div>
              <MovementFeed movements={data.bank.recent_movements} tone="info" showBank />
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
