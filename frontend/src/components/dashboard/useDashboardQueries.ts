import { useMemo } from 'react';
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { ownerApi } from '@/lib/owner-api';
import { cairoTodayIso, daysAgoIso } from './format';
import type { Period } from './PeriodChip';

/* Refetch tiers.
 *  HOT   — what's happening right now (sales, refunds, expenses)
 *  WARM  — short-term shape (hourly curve, cash position, recent activity)
 *  COLD  — slower-moving aggregates (14-day trend, stock, top fabrics)
 *
 * Each interval is jittered by up to 4s so 10+ queries don't refetch
 * simultaneously when the tab regains focus or an interval boundary lands.
 */
const HOT = 20_000;
const WARM = 60_000;
const COLD = 300_000;

function jitter(base: number, key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  const offset = Math.abs(hash) % 4_000;
  return base + offset;
}

const sharedOptions = {
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  refetchIntervalInBackground: false,
  retry: 1,
} as const;

export type OwnerDashboardQueries = ReturnType<typeof useOwnerDashboardQueries>;

/* All owner-dashboard queries in one hook so widgets don't fan out to a
 * dozen useQuery calls. Returns the typed results plus helpers. */
export function useOwnerDashboardQueries({
  topFabricsPeriod,
}: {
  topFabricsPeriod: Period;
}) {
  const todayIso = useMemo(cairoTodayIso, []);
  const expensesFrom = useMemo(() => daysAgoIso(29), []);

  const summary = useQuery({
    queryKey: ['dashboard', 'owner', 'summary-today'],
    queryFn: ownerApi.summaryToday,
    staleTime: 10_000,
    refetchInterval: jitter(HOT, 'summary-today'),
    ...sharedOptions,
  });

  const cash = useQuery({
    queryKey: ['dashboard', 'owner', 'cash-position'],
    queryFn: ownerApi.cashPosition,
    staleTime: 30_000,
    refetchInterval: jitter(WARM, 'cash-position'),
    ...sharedOptions,
  });

  const openInvoices = useQuery({
    queryKey: ['dashboard', 'owner', 'open-invoices'],
    queryFn: ownerApi.openInvoices,
    staleTime: 30_000,
    refetchInterval: jitter(WARM, 'open-invoices'),
    ...sharedOptions,
  });

  const notifications = useQuery({
    queryKey: ['dashboard', 'owner', 'notifications'],
    queryFn: () => ownerApi.notifications({ page: 1, limit: 5 }),
    staleTime: 15_000,
    refetchInterval: jitter(30_000, 'notifications'),
    ...sharedOptions,
  });

  const topFabrics = useQuery({
    queryKey: ['dashboard', 'owner', 'top-fabrics', topFabricsPeriod],
    queryFn: () => ownerApi.topFabrics(topFabricsPeriod),
    staleTime: 120_000,
    refetchInterval: jitter(COLD, `top-fabrics-${topFabricsPeriod}`),
    placeholderData: keepPreviousData,
    ...sharedOptions,
  });

  const expenses = useQuery({
    queryKey: ['dashboard', 'owner', 'expenses-summary', expensesFrom, todayIso],
    queryFn: () => ownerApi.expensesSummary(expensesFrom, todayIso),
    staleTime: 120_000,
    refetchInterval: jitter(COLD, 'expenses-summary'),
    ...sharedOptions,
  });

  const queries: UseQueryResult<unknown>[] = [
    summary, cash, openInvoices, notifications,
    topFabrics, expenses,
  ];

  const lastUpdatedMs = queries.reduce(
    (acc, q) => (q.dataUpdatedAt > acc ? q.dataUpdatedAt : acc),
    0,
  );

  return {
    summary,
    cash,
    openInvoices,
    notifications,
    topFabrics,
    expenses,
    lastUpdatedMs,
    todayIso,
  };
}
