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
import { StockHealthDonut } from './StockHealthDonut';
import { ExpensesStackedBar } from './ExpensesStackedBar';
import { DashboardCardSkeleton, WidgetError } from './states';
import { useOwnerDashboardQueries } from './useDashboardQueries';

export function OwnerDashboard() {
  const q = useOwnerDashboardQueries();

  const summary = q.summary.data;
  const cash = q.cash.data;
  const openInvoices = q.openInvoices.data;
  const notifications = q.notifications.data;
  const hourly = q.hourly.data;
  const stock = q.stockSummary.data;
  const expenses = q.expenses.data;

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
        <Slot colSpan="lg:col-span-6">
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
        <Slot colSpan="lg:col-span-6">
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
      </FoldSection>

      {/* ── Fold C — Movers ────────────────────────────────────────────── */}
      <FoldSection
        label={ar.dashboard.folds.movers}
        caption={ar.dashboard.foldCaption.movers}
      >
        <Slot colSpan="lg:col-span-6">
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
  return <div className={`col-span-12 ${colSpan} h-full`}>{children}</div>;
}
