import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, Receipt } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { StatusPill } from '@/components/StatusPill';
import { DashboardShell } from './DashboardShell';
import { FoldSection } from './FoldSection';
import { KpiGrid } from './KpiGrid';
import { MetricCard } from './MetricCard';
import { NotificationsPeek } from './NotificationsPeek';
import { DashboardCardSkeleton, WidgetCard, WidgetError } from './states';
import { QuietEmpty } from './QuietEmpty';
import { EGP, fmtMoney, num } from './format';
import { useSellerDashboardQueries } from './useSellerQueries';
import type { OpenInvoiceRow } from '@/lib/sales-types';

/* Seller-only landing — uses /reports/daily, /cash/balance, /invoices/open,
 * /notifications. Never calls any /owner/* endpoint. */
export function SellerDashboard() {
  const q = useSellerDashboardQueries();

  const daily = q.daily.data;
  const drawer = q.drawer.data;
  const open = q.openInvoices.data;
  const notifications = q.notifications.data;

  const totalRevenue = daily ? num(daily.sales_summary.total_net_egp) : 0;
  const invoiceCount = daily ? daily.sales_summary.invoice_count : 0;
  const totalIn = daily ? num(daily.cash.total_in_egp) : 0;
  const totalOut = daily ? num(daily.cash.total_out_egp) : 0;
  const netCash = totalIn - totalOut;

  return (
    <DashboardShell
      title={ar.dashboard.title}
      subtitle={ar.dashboard.sellerSubtitle}
      lastUpdatedMs={q.lastUpdatedMs}
    >
      <FoldSection
        label={ar.dashboard.seller.shiftTitle}
        caption={ar.dashboard.foldCaption.pulse}
        divider={false}
      >
        <Slot colSpan="lg:col-span-12">
          {q.daily.isLoading && !daily ? (
            <KpiGrid>
              <DashboardCardSkeleton />
              <DashboardCardSkeleton />
              <DashboardCardSkeleton />
              <DashboardCardSkeleton />
            </KpiGrid>
          ) : q.daily.error ? (
            <WidgetError
              title={ar.dashboard.errors.shift}
              onRetry={() => void q.daily.refetch()}
            />
          ) : (
            <KpiGrid>
              <MetricCard
                label={ar.dashboard.seller.revenue}
                value={totalRevenue}
                tone={totalRevenue > 0 ? 'accent' : 'default'}
                meta={
                  totalRevenue === 0
                    ? ar.dashboard.seller.shiftHint
                    : undefined
                }
              />
              <MetricCard
                label={ar.dashboard.seller.sales}
                value={invoiceCount}
                format="int"
                meta={invoiceCount === 0 ? ar.dashboard.seller.shiftHint : undefined}
              />
              <MetricCard
                label={ar.dashboard.seller.netCash}
                value={netCash}
                tone={
                  netCash > 0 ? 'success' : netCash < 0 ? 'warning' : 'default'
                }
                meta={
                  daily
                    ? `${ar.dashboard.pulse.cashIn} ${fmtMoney(totalIn)} · ${ar.dashboard.pulse.cashOut} ${fmtMoney(totalOut)}`
                    : undefined
                }
              />
              <DrawerTile drawer={drawer} loading={q.drawer.isLoading} />
            </KpiGrid>
          )}
        </Slot>

        <Slot colSpan="lg:col-span-7">
          {q.daily.error ? (
            <WidgetError
              title={ar.dashboard.errors.shift}
              onRetry={() => void q.daily.refetch()}
            />
          ) : (
            <LastInvoicesCard daily={daily} loading={q.daily.isLoading} />
          )}
        </Slot>

        <Slot colSpan="lg:col-span-5">
          {q.openInvoices.error ? (
            <WidgetError
              title={ar.dashboard.errors.openInvoices}
              onRetry={() => void q.openInvoices.refetch()}
            />
          ) : (
            <FollowUpCard rows={open ?? []} loading={q.openInvoices.isLoading} />
          )}
        </Slot>

        <Slot colSpan="lg:col-span-12">
          {q.notifications.error ? (
            <WidgetError
              title={ar.dashboard.errors.notifications}
              onRetry={() => void q.notifications.refetch()}
            />
          ) : notifications ? (
            <NotificationsPeek
              rows={notifications.rows}
              emptyCaption={ar.dashboard.seller.alertsHint}
            />
          ) : (
            <DashboardCardSkeleton lines={3} />
          )}
        </Slot>
      </FoldSection>
    </DashboardShell>
  );
}

function DrawerTile({
  drawer,
  loading,
}: {
  drawer: { current_balance_egp: number; opening_set_at: string | null } | undefined;
  loading: boolean;
}) {
  if (loading && !drawer) return <DashboardCardSkeleton />;
  const balance = drawer?.current_balance_egp ?? 0;
  const opened = drawer?.opening_set_at;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-elevated shadow-sm p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted mb-2">
        {ar.dashboard.seller.drawerTitle}
      </p>
      <div className="flex items-baseline gap-1.5 tabular-num">
        <span className="text-3xl font-semibold text-foreground" dir="ltr">
          {balance === 0 ? '—' : fmtMoney(balance)}
        </span>
        {balance > 0 && (
          <span className="text-sm text-foreground-tertiary">{EGP}</span>
        )}
      </div>
      <p className="text-xs text-foreground-tertiary mt-2">
        {opened
          ? `${ar.dashboard.seller.drawerOpened} ${opened.slice(0, 10)}`
          : ar.dashboard.seller.drawerHint}
      </p>
    </div>
  );
}

function LastInvoicesCard({
  daily,
  loading,
}: {
  daily: ReturnType<typeof useSellerDashboardQueries>['daily']['data'];
  loading: boolean;
}) {
  if (loading && !daily) return <DashboardCardSkeleton lines={5} />;

  const refundsVoids = daily?.refunds_voids ?? [];
  const fabricRows = daily?.sales_by_fabric ?? [];
  const recent = fabricRows.slice(-5).reverse();

  return (
    <WidgetCard
      title={ar.dashboard.seller.lastInvoices}
      action={
        <Link
          to="/invoices"
          className="text-xs text-foreground-muted hover:text-accent inline-flex items-center gap-1"
        >
          {ar.dashboard.seller.viewAll}
          <ChevronLeft className="size-3.5" aria-hidden />
        </Link>
      }
    >
      {recent.length === 0 && refundsVoids.length === 0 ? (
        <div className="flex items-center gap-3 py-2">
          <Receipt className="size-7 text-foreground-tertiary shrink-0" aria-hidden />
          <p className="text-sm text-foreground-tertiary">
            {ar.dashboard.seller.lastInvoicesHint}
          </p>
        </div>
      ) : (
        <ul className="space-y-2 text-sm">
          {recent.map((r, i) => (
            <li key={i} className="flex items-baseline gap-3">
              <span className="size-1.5 rounded-full bg-success shrink-0" aria-hidden />
              <span className="flex-1 text-foreground truncate">
                {r.fabric_name_ar}
                <span className="text-foreground-tertiary text-xs me-1">
                  {' '}
                  ({r.color_name_ar})
                </span>
              </span>
              <span
                dir="ltr"
                className="tabular-num text-foreground font-medium"
              >
                {fmtMoney(num(r.revenue_egp))} ج.م
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

function FollowUpCard({
  rows,
  loading,
}: {
  rows: OpenInvoiceRow[];
  loading: boolean;
}) {
  if (loading && rows.length === 0) return <DashboardCardSkeleton lines={4} />;

  const stale = rows.filter((r) => r.is_stale);
  const list = stale.length > 0 ? stale.slice(0, 5) : rows.slice(0, 5);

  if (rows.length === 0) {
    return (
      <WidgetCard title={ar.dashboard.seller.followUpTitle}>
        <div className="flex items-center gap-3 py-2">
          <CheckCircle2 className="size-7 text-success shrink-0" aria-hidden />
          <p className="text-sm text-foreground">{ar.dashboard.seller.followUpHint}</p>
        </div>
      </WidgetCard>
    );
  }

  return (
    <WidgetCard
      title={ar.dashboard.seller.followUpTitle}
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
      <ul className="space-y-2 text-sm">
        {list.map((r) => (
          <li key={r.id} className="flex items-baseline gap-3">
            <span className="text-foreground truncate flex-1">
              {r.customer_name_ar}
            </span>
            {r.is_stale && <StatusPill tone="warning">{ar.dashboard.pulse.stalePill}</StatusPill>}
            <span dir="ltr" className="tabular-num text-foreground-tertiary text-xs">
              {r.age_days}{' '}
              {ar.dashboard.pulse.ageDays}
            </span>
            <span
              dir="ltr"
              className="tabular-num text-foreground font-medium"
            >
              {fmtMoney(num(r.balance_egp))} ج.م
            </span>
          </li>
        ))}
      </ul>
    </WidgetCard>
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
