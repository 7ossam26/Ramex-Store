import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Eye, PackageCheck, PlusCircle } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { stockRequestsApi } from '@/lib/stock-requests-api';
import type { StockRequestListRow, StockRequestStatus } from '@/lib/stock-requests-types';
import { usePermissions } from '@/lib/permissions';
import { usePersistentState } from '@/hooks/usePersistentState';
import { PageShell, SectionCard } from '@/components/Layout/PageShell';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { TableFilterBar } from '@/components/TableFilterBar';
import { FilterChip } from '@/components/FilterChip';
import { Button } from '@/components/ui/button';
import { StockRequestStatusPill } from '@/components/stockRequests/StockRequestPills';

type Filter = 'active' | StockRequestStatus | 'all';
const FILTERS: Filter[] = ['active', 'open', 'in_progress', 'awaiting_review', 'completed', 'cancelled', 'all'];
const ACTIVE_LABEL = 'تحتاج متابعة';

/**
 * One list for both sides. The shop (stock_requests.write) sees its requests and
 * can start a new one; the factory (stock_request_fulfilment.write) jumps straight
 * to preparing.
 */
export function StockRequestsListPage() {
  const navigate = useNavigate();
  const { can, loading: permsLoading } = usePermissions();
  const canRequest = !permsLoading && can('stock_requests', 'write');
  const canPrepare = !permsLoading && can('stock_request_fulfilment', 'write');

  const [filter, setFilter] = usePersistentState<Filter>('stockRequests.filter', 'active');
  const [search, setSearch] = useState('');

  const q = useQuery({
    queryKey: ['stock-requests', filter, search],
    queryFn: () =>
      stockRequestsApi.list({
        active: filter === 'active',
        status: filter !== 'active' && filter !== 'all' ? filter : undefined,
        q: search.trim() || undefined,
      }),
  });

  const columns: Column<StockRequestListRow>[] = [
    {
      key: 'request_no',
      header: ar.stockRequests.requestNo,
      primary: true,
      cell: (r) => (
        <Link to={`/stock-requests/${r.id}`} className="text-accent hover:text-accent-hover underline underline-offset-2 font-mono tabular-num" dir="ltr">
          {r.request_no}
        </Link>
      ),
    },
    { key: 'status', header: 'الحالة', cell: (r) => <StockRequestStatusPill status={r.status} /> },
    {
      key: 'progress',
      header: ar.stockRequests.counts.total,
      cell: (r) => (
        <span className="text-foreground-muted text-xs tabular-num">
          {ar.stockRequests.progress.replace('{accepted}', String(r.accepted)).replace('{total}', String(r.total - r.cancelled))}
          {r.requested + r.packing > 0 && <> · {ar.stockRequests.counts.waiting}: {r.requested + r.packing}</>}
          {r.awaiting_review > 0 && <> · {ar.stockRequests.outcome.awaiting_review}: {r.awaiting_review}</>}
          {r.unavailable > 0 && <> · {ar.stockRequests.counts.unavailable}: {r.unavailable}</>}
          {r.rejected > 0 && <> · {ar.stockRequests.counts.rejected}: {r.rejected}</>}
        </span>
      ),
    },
    { key: 'by', header: ar.stockRequests.requestedBy, cell: (r) => r.requested_by_name, hideOnMobile: true },
    {
      key: 'created',
      header: ar.stockRequests.createdAt,
      secondary: true,
      cell: (r) => <span className="text-foreground-muted">{new Date(r.created_at).toLocaleString('ar-EG-u-nu-latn')}</span>,
    },
  ];

  const title = canPrepare && !canRequest ? ar.stockRequests.factoryTitle : ar.stockRequests.title;

  return (
    <PageShell
      title={title}
      description={canPrepare && !canRequest ? ar.stockRequests.factoryListDesc : ar.stockRequests.listDesc}
      backTo="/shipments"
      actions={
        canRequest ? (
          <Button onClick={() => navigate('/stock-requests/new')}>
            <PlusCircle className="size-4" /> {ar.stockRequests.newRequest}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f === 'active' ? ACTIVE_LABEL : f === 'all' ? ar.shipments.allStatuses : ar.stockRequests.status[f]}
          </FilterChip>
        ))}
      </div>

      <TableFilterBar
        search={{ value: search, onChange: setSearch, placeholder: ar.stockRequests.requestNo, dir: 'ltr' }}
        resultCount={q.data?.length ?? 0}
      />

      <SectionCard noPadding>
        <ResponsiveTable
          columns={columns}
          rows={q.data ?? []}
          rowKey={(r) => String(r.id)}
          empty={ar.stockRequests.empty}
          isLoading={q.isLoading || permsLoading}
          isError={q.isError}
          onRetry={() => q.refetch()}
          resetKey={`${filter}|${search}`}
          actions={(r) => (
            <div className="flex gap-1 justify-end">
              <Button variant="ghost" size="sm" onClick={() => navigate(`/stock-requests/${r.id}`)} title={ar.stockRequests.viewRequest} aria-label={ar.stockRequests.viewRequest}>
                <Eye className="size-4" />
              </Button>
              {canPrepare && (r.status === 'open' || r.status === 'in_progress') && !r.cancelled_at && (
                <Button variant="ghost" size="sm" onClick={() => navigate(`/stock-requests/${r.id}/prepare`)} title={ar.stockRequests.prepare} aria-label={ar.stockRequests.prepare}>
                  <PackageCheck className="size-4" />
                </Button>
              )}
            </div>
          )}
        />
      </SectionCard>
    </PageShell>
  );
}
