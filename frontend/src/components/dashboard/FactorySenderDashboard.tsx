import { Link } from 'react-router-dom';
import { ChevronLeft, Package, Send, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import { DashboardShell } from './DashboardShell';
import { FoldSection } from './FoldSection';
import { KpiGrid } from './KpiGrid';
import { MetricCard } from './MetricCard';
import { DashboardCardSkeleton, WidgetCard, WidgetError } from './states';
import { fmtInt } from './format';

export function FactorySenderDashboard() {
  const q = useQuery({
    queryKey: ['factory-sender-dashboard'],
    queryFn: inventoryApi.getFactorySenderDashboard,
    refetchInterval: 60_000,
  });

  const data = q.data;

  return (
    <DashboardShell
      title={ar.dashboard.title}
      subtitle={ar.dashboard.factory.subtitle}
      lastUpdatedMs={q.dataUpdatedAt > 0 ? q.dataUpdatedAt : undefined}
    >
      <FoldSection label={ar.dashboard.factory.stockTitle} divider={false}>
        <Slot colSpan="lg:col-span-12">
          {q.isLoading ? (
            <KpiGrid>
              <DashboardCardSkeleton />
              <DashboardCardSkeleton />
              <DashboardCardSkeleton />
              <DashboardCardSkeleton />
            </KpiGrid>
          ) : q.error ? (
            <WidgetError
              title="تعذر تحميل بيانات المصنع"
              onRetry={() => void q.refetch()}
            />
          ) : (
            <KpiGrid>
              <MetricCard
                label={ar.dashboard.factory.rollCount}
                value={data?.factory_stock.roll_count ?? 0}
                format="int"
                tone={data && data.factory_stock.roll_count > 0 ? 'accent' : 'default'}
                emDashOnZero
              />
              <MetricCard
                label={ar.dashboard.factory.totalKg}
                value={data?.factory_stock.total_kg ?? 0}
                format="int"
                suffix="كجم"
                emDashOnZero
              />
              <MetricCard
                label={ar.dashboard.factory.totalMeters}
                value={data?.factory_stock.total_meters ?? 0}
                format="int"
                suffix="م"
                emDashOnZero
              />
              <MetricCard
                label={ar.dashboard.factory.availableRolls}
                value={data?.available_rolls ?? 0}
                format="int"
                tone={data && data.available_rolls > 0 ? 'success' : 'default'}
                emDashOnZero
              />
            </KpiGrid>
          )}
        </Slot>

        <Slot colSpan="lg:col-span-6">
          {q.isLoading ? (
            <DashboardCardSkeleton lines={3} />
          ) : q.error ? null : (
            <ShipmentsCard data={data} />
          )}
        </Slot>

        <Slot colSpan="lg:col-span-6">
          <QuickActionsCard />
        </Slot>
      </FoldSection>
    </DashboardShell>
  );
}

function ShipmentsCard({
  data,
}: {
  data: ReturnType<typeof useQuery<Awaited<ReturnType<typeof inventoryApi.getFactorySenderDashboard>>>>['data'];
}) {
  return (
    <WidgetCard
      title="الطلبيات"
      action={
        <Link
          to="/shipments"
          className="text-xs text-foreground-muted hover:text-accent inline-flex items-center gap-1"
        >
          {ar.dashboard.factory.viewShipments}
          <ChevronLeft className="size-3.5" aria-hidden />
        </Link>
      }
    >
      <ul className="space-y-3 text-sm">
        <li className="flex items-center justify-between">
          <span className="text-foreground-muted">{ar.dashboard.factory.shipmentsWeek}</span>
          <span className="font-semibold text-foreground tabular-num">
            {fmtInt(data?.shipments_this_week ?? 0)}
          </span>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-foreground-muted">{ar.dashboard.factory.pendingShipments}</span>
          <span
            className={
              data && data.pending_shipments > 0
                ? 'font-semibold text-warning-foreground tabular-num'
                : 'font-semibold text-foreground tabular-num'
            }
          >
            {fmtInt(data?.pending_shipments ?? 0)}
          </span>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-foreground-muted">{ar.dashboard.factory.rejectedLines}</span>
          <span
            className={
              data && data.rejected_lines_30d > 0
                ? 'font-semibold text-danger-foreground tabular-num'
                : 'font-semibold text-foreground tabular-num'
            }
          >
            {fmtInt(data?.rejected_lines_30d ?? 0)}
          </span>
        </li>
      </ul>
    </WidgetCard>
  );
}

function QuickActionsCard() {
  return (
    <WidgetCard title={ar.dashboard.factory.quickActions}>
      <div className="flex flex-col gap-3">
        <Link
          to="/items/tops/add"
          className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="size-4" aria-hidden />
          {ar.dashboard.factory.addTop}
        </Link>
        <Link
          to="/shipments/new"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-hover transition-colors"
        >
          <Send className="size-4" aria-hidden />
          {ar.dashboard.factory.newShipment}
        </Link>
        <Link
          to="/inventory/stock?warehouse=factory"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-elevated px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-hover transition-colors"
        >
          <Package className="size-4" aria-hidden />
          {ar.dashboard.factory.viewStock}
        </Link>
      </div>
    </WidgetCard>
  );
}

function Slot({ colSpan, children }: { colSpan: string; children: React.ReactNode }) {
  return <div className={`col-span-12 ${colSpan}`}>{children}</div>;
}
