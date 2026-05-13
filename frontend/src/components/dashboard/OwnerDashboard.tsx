import { useState } from 'react';
import { ar } from '@/i18n/ar';
import { DashboardShell } from './DashboardShell';
import { FoldSection } from './FoldSection';
import { KpiGrid } from './KpiGrid';
import { MetricCard } from './MetricCard';
import { PulseHeroCard } from './PulseHeroCard';
import { CashAndBankStrip } from './CashAndBankStrip';
import { OpenInvoicesPulse } from './OpenInvoicesPulse';
import { NotificationsPeek } from './NotificationsPeek';
import { HourlyCurveCard } from './HourlyCurveCard';
import { RevenueTrendCard } from './RevenueTrendCard';
import { StockHealthDonut } from './StockHealthDonut';
import { TurnoverStat } from './TurnoverStat';
import { TopFabricsList } from './TopFabricsList';
import { ExpensesStackedBar } from './ExpensesStackedBar';
import { DamageLossList } from './DamageLossList';
import { ActivityFeed } from './ActivityFeed';
import { DashboardCardSkeleton, WidgetError } from './states';
import type { Period } from './PeriodChip';
import { useOwnerDashboardQueries } from './useDashboardQueries';

export function OwnerDashboard() {
  const [topFabricsPeriod, setTopFabricsPeriod] = useState<Period>('7d');
  const [turnoverPeriod, setTurnoverPeriod] = useState<Period>('30d');

  const q = useOwnerDashboardQueries({ topFabricsPeriod, turnoverPeriod });

  const summary = q.summary.data;
  const cash = q.cash.data;
  const openInvoices = q.openInvoices.data;
  const notifications = q.notifications.data;
  const hourly = q.hourly.data;
  const dailyTotals = q.dailyTotals.data;
  const stock = q.stockSummary.data;
  const turnover = q.turnover.data;
  const topFabrics = q.topFabrics.data;
  const expenses = q.expenses.data;
  const damage = q.damage.data;
  const audit = q.audit.data;

  return (
    <DashboardShell
      title={ar.dashboard.title}
      subtitle={ar.dashboard.ownerSubtitle}
      lastUpdatedMs={q.lastUpdatedMs}
    >
      {/* ── Fold A — Pulse ─────────────────────────────────────────────── */}
      <FoldSection
        label={ar.dashboard.folds.pulse}
        caption={ar.dashboard.foldCaption.pulse}
        divider={false}
      >
        {q.summary.isLoading && !summary ? (
          <>
            <Slot colSpan="lg:col-span-3"><DashboardCardSkeleton /></Slot>
            <Slot colSpan="lg:col-span-3"><DashboardCardSkeleton /></Slot>
            <Slot colSpan="lg:col-span-3"><DashboardCardSkeleton /></Slot>
            <Slot colSpan="lg:col-span-3"><DashboardCardSkeleton /></Slot>
          </>
        ) : q.summary.error ? (
          <Slot colSpan="lg:col-span-12">
            <WidgetError
              title={ar.dashboard.errors.summary}
              onRetry={() => void q.summary.refetch()}
            />
          </Slot>
        ) : summary ? (
          <Slot colSpan="lg:col-span-12">
            <KpiGrid>
              <MetricCard
                label={ar.dashboard.pulse.revenue}
                value={summary.revenue_egp}
                tone={summary.revenue_egp > 0 ? 'accent' : 'default'}
                meta={
                  summary.revenue_egp === 0
                    ? ar.dashboard.pulse.revenueHint
                    : `${summary.sales_count} ${ar.dashboard.pulse.sales}`
                }
              />
              <MetricCard
                label={ar.dashboard.pulse.sales}
                value={summary.sales_count}
                format="int"
                meta={
                  summary.sales_count === 0
                    ? ar.dashboard.pulse.salesHint
                    : undefined
                }
              />
              <MetricCard
                label={ar.dashboard.pulse.refunds}
                value={summary.refund_total_egp}
                meta={
                  summary.refund_count === 0
                    ? ar.dashboard.pulse.refundsHint
                    : `${summary.refund_count} مرتجع`
                }
                tone={summary.refund_total_egp > 0 ? 'warning' : 'default'}
              />
              <MetricCard
                label={ar.dashboard.pulse.expenses}
                value={summary.expenses_total_egp}
                meta={
                  summary.expenses_total_egp === 0
                    ? ar.dashboard.pulse.expensesHint
                    : undefined
                }
              />
            </KpiGrid>
          </Slot>
        ) : null}

        {summary && (
          <Slot colSpan="lg:col-span-6">
            <PulseHeroCard
              cashIn={summary.cash_in_egp}
              cashOut={summary.cash_out_egp}
            />
          </Slot>
        )}
        {cash && (
          <Slot colSpan="lg:col-span-6">
            <CashAndBankStrip data={cash} />
          </Slot>
        )}
        {q.cash.isLoading && !cash && (
          <Slot colSpan="lg:col-span-6"><DashboardCardSkeleton /></Slot>
        )}

        {openInvoices && (
          <Slot colSpan="lg:col-span-6">
            <OpenInvoicesPulse rows={openInvoices} />
          </Slot>
        )}
        {q.openInvoices.isLoading && !openInvoices && (
          <Slot colSpan="lg:col-span-6"><DashboardCardSkeleton /></Slot>
        )}

        {notifications && (
          <Slot colSpan="lg:col-span-6">
            <NotificationsPeek rows={notifications.rows} />
          </Slot>
        )}
        {q.notifications.isLoading && !notifications && (
          <Slot colSpan="lg:col-span-6"><DashboardCardSkeleton lines={3} /></Slot>
        )}
      </FoldSection>

      {/* ── Fold B — Trends ────────────────────────────────────────────── */}
      <FoldSection
        label={ar.dashboard.folds.trends}
        caption={ar.dashboard.foldCaption.trends}
      >
        <Slot colSpan="lg:col-span-7">
          {hourly ? (
            <HourlyCurveCard rows={hourly} />
          ) : q.hourly.error ? (
            <WidgetError
              title={ar.dashboard.errors.hourly}
              onRetry={() => void q.hourly.refetch()}
            />
          ) : (
            <DashboardCardSkeleton lines={4} />
          )}
        </Slot>
        <Slot colSpan="lg:col-span-5">
          {dailyTotals ? (
            <RevenueTrendCard rows={dailyTotals} />
          ) : q.dailyTotals.error ? (
            <WidgetError
              title={ar.dashboard.errors.trend}
              onRetry={() => void q.dailyTotals.refetch()}
            />
          ) : (
            <DashboardCardSkeleton lines={4} />
          )}
        </Slot>
        <Slot colSpan="lg:col-span-8">
          {stock ? (
            <StockHealthDonut rows={stock} />
          ) : q.stockSummary.error ? (
            <WidgetError
              title={ar.dashboard.errors.stock}
              onRetry={() => void q.stockSummary.refetch()}
            />
          ) : (
            <DashboardCardSkeleton lines={3} />
          )}
        </Slot>
        <Slot colSpan="lg:col-span-4">
          {q.turnover.error ? (
            <WidgetError
              title={ar.dashboard.errors.turnover}
              onRetry={() => void q.turnover.refetch()}
            />
          ) : (
            <TurnoverStat
              period={turnoverPeriod}
              onPeriodChange={setTurnoverPeriod}
              data={turnover}
            />
          )}
        </Slot>
      </FoldSection>

      {/* ── Fold C — Movers ────────────────────────────────────────────── */}
      <FoldSection
        label={ar.dashboard.folds.movers}
        caption={ar.dashboard.foldCaption.movers}
      >
        <Slot colSpan="lg:col-span-7">
          {q.topFabrics.error ? (
            <WidgetError
              title={ar.dashboard.errors.topFabrics}
              onRetry={() => void q.topFabrics.refetch()}
            />
          ) : (
            <TopFabricsList
              rows={topFabrics ?? []}
              period={topFabricsPeriod}
              onPeriodChange={setTopFabricsPeriod}
            />
          )}
        </Slot>
        <Slot colSpan="lg:col-span-5">
          {expenses ? (
            <ExpensesStackedBar data={expenses} />
          ) : q.expenses.error ? (
            <WidgetError
              title={ar.dashboard.errors.expenses}
              onRetry={() => void q.expenses.refetch()}
            />
          ) : (
            <DashboardCardSkeleton lines={3} />
          )}
        </Slot>
        <Slot colSpan="lg:col-span-5">
          {damage ? (
            <DamageLossList data={damage} />
          ) : q.damage.error ? (
            <WidgetError
              title={ar.dashboard.errors.damage}
              onRetry={() => void q.damage.refetch()}
            />
          ) : (
            <DashboardCardSkeleton lines={3} />
          )}
        </Slot>
        <Slot colSpan="lg:col-span-7">
          {audit ? (
            <ActivityFeed rows={audit.rows} />
          ) : q.audit.error ? (
            <WidgetError
              title={ar.dashboard.errors.activity}
              onRetry={() => void q.audit.refetch()}
            />
          ) : (
            <DashboardCardSkeleton lines={4} />
          )}
        </Slot>
      </FoldSection>
    </DashboardShell>
  );
}

function Slot({
  colSpan,
  children,
}: {
  colSpan: string;
  children: React.ReactNode;
}) {
  return <div className={`col-span-12 ${colSpan}`}>{children}</div>;
}
