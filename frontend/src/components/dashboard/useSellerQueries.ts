import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { financeApi } from '@/lib/finance-api';
import { reportsApi, type DailyReport } from '@/lib/reports-api';
import { salesApi } from '@/lib/sales-api';
import { notificationsApi, type NotificationRow } from '@/lib/notifications-api';
import { cairoTodayIso } from './format';

/* Seller-only query hook.
 *
 * IMPORTANT: this hook MUST NOT call any /owner/* endpoint — they are owner-only
 * and would 403 for shop_seller. Keep this file completely independent from
 * useDashboardQueries (no shared factory). */

const HOT = 15_000;
const WARM = 60_000;

function jitter(base: number, key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return base + (Math.abs(hash) % 4_000);
}

const sharedOptions = {
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  refetchIntervalInBackground: false,
  retry: 1,
} as const;

export type SellerDashboardQueries = ReturnType<typeof useSellerDashboardQueries>;

export function useSellerDashboardQueries() {
  const todayIso = useMemo(cairoTodayIso, []);

  const daily = useQuery<DailyReport>({
    queryKey: ['dashboard', 'seller', 'daily', todayIso],
    queryFn: () => reportsApi.getDaily(todayIso),
    staleTime: 8_000,
    refetchInterval: jitter(HOT, 'seller-daily'),
    ...sharedOptions,
  });

  const drawer = useQuery({
    queryKey: ['dashboard', 'seller', 'cash-balance'],
    queryFn: financeApi.getCashBalance,
    staleTime: 15_000,
    refetchInterval: jitter(30_000, 'seller-cash'),
    ...sharedOptions,
  });

  const openInvoices = useQuery({
    queryKey: ['dashboard', 'seller', 'open-invoices'],
    queryFn: salesApi.listOpen,
    staleTime: 30_000,
    refetchInterval: jitter(WARM, 'seller-open'),
    ...sharedOptions,
  });

  /* Notifications endpoint for the current user — seller-safe (NOT /owner/*).
   * Limit to 5 unread; archived excluded. */
  const notifications = useQuery({
    queryKey: ['dashboard', 'seller', 'notifications'],
    queryFn: () => notificationsApi.list({ page: 1, limit: 5 }).then((r) => r.data),
    staleTime: 15_000,
    refetchInterval: jitter(30_000, 'seller-notifs'),
    ...sharedOptions,
  });

  const queries: UseQueryResult<unknown>[] = [daily, drawer, openInvoices, notifications];
  const lastUpdatedMs = queries.reduce(
    (acc, q) => (q.dataUpdatedAt > acc ? q.dataUpdatedAt : acc),
    0,
  );

  return { daily, drawer, openInvoices, notifications, lastUpdatedMs, todayIso };
}

export type SellerNotification = NotificationRow;
