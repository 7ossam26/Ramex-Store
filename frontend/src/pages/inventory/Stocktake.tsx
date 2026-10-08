import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import axios from 'axios';
import { ClipboardList } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import { extractApiError } from '@/lib/api-error';
import type { StocktakeListRow, StocktakeMode, Warehouse } from '@/lib/inventory-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PageShell } from '@/components/Layout/PageShell';
import { StatusPill } from '@/components/StatusPill';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EmptyState } from '@/components/EmptyState';
import { TableSkeleton } from '@/components/TableSkeleton';
import { SearchableSelect } from '@/components/ui/searchable-select';

const selectClass =
  'w-full h-11 sm:h-10 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75';

export function StocktakeStatusPill({ s }: { s: Pick<StocktakeListRow, 'status' | 'unresolved_count'> }) {
  if (s.status === 'open') return <StatusPill tone="info">{ar.stocktake.statusOpen}</StatusPill>;
  if (s.status === 'cancelled') return <StatusPill tone="neutral">{ar.stocktake.statusCancelled}</StatusPill>;
  if (s.unresolved_count > 0) {
    return <StatusPill tone="warning">{ar.stocktake.statusPending(s.unresolved_count)}</StatusPill>;
  }
  return <StatusPill tone="success">{ar.stocktake.statusCompleted}</StatusPill>;
}

/** The count that stops a new one from starting in this warehouse, if any. */
function blockerFor(rows: StocktakeListRow[], warehouse: Warehouse): StocktakeListRow | undefined {
  return rows.find(
    (r) => r.warehouse === warehouse && (r.status === 'open' || r.unresolved_count > 0),
  );
}

export function StocktakePage() {
  const listQ = useQuery({ queryKey: ['stocktakes'], queryFn: inventoryApi.listStocktakes });
  return (
    <PageShell title={ar.stocktake.title} description={ar.hubs.inventoryStocktakeDesc} backTo="/inventory">
      <StartCard rows={listQ.data ?? []} loading={listQ.isLoading} />
      <PastStocktakes q={listQ} />
    </PageShell>
  );
}

function StartCard({ rows, loading }: { rows: StocktakeListRow[]; loading: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState<StocktakeMode>('roll_level');
  const [warehouse, setWarehouse] = useState<Warehouse>('shop');

  const m = useMutation({
    mutationFn: () => inventoryApi.startStocktake({ mode, warehouse }),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['stocktakes'] });
      navigate(`/inventory/stocktake/${s.id}`);
    },
    onError: () => qc.invalidateQueries({ queryKey: ['stocktakes'] }),
  });

  const blocker = blockerFor(rows, warehouse);
  // The server also refuses, and names the blocking count.
  const serverBlockerId =
    axios.isAxiosError(m.error) ? (m.error.response?.data as { stocktake_id?: number })?.stocktake_id : undefined;
  const blockingId = blocker?.id ?? serverBlockerId;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ar.stocktake.start}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="space-y-1">
            <Label>{ar.stocktake.mode}</Label>
            <SearchableSelect value={mode} onChange={(e) => setMode(e.target.value as StocktakeMode)} className={selectClass}>
              <option value="roll_level">{ar.stocktake.rollLevel}</option>
              <option value="aggregate">{ar.stocktake.aggregate}</option>
            </SearchableSelect>
          </div>
          <div className="space-y-1">
            <Label>{ar.stocktake.warehouse}</Label>
            <SearchableSelect
              value={warehouse}
              onChange={(e) => { setWarehouse(e.target.value as Warehouse); m.reset(); }}
              className={selectClass}
            >
              <option value="shop">{ar.warehouses.shop}</option>
              <option value="factory">{ar.warehouses.factory}</option>
              <option value="damaged_shop">{ar.warehouses.damaged_shop}</option>
            </SearchableSelect>
          </div>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || loading || !!blocker}
            className="w-full sm:w-auto h-11 sm:h-10"
          >
            {ar.stocktake.start}
          </Button>
        </div>

        {(blocker || m.isError) && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning-subtle px-3 py-2 text-sm text-warning-foreground">
            <span className="flex-1 min-w-[200px]">
              {blocker
                ? blocker.status === 'open' ? ar.stocktake.blockedOpen : ar.stocktake.blockedPending
                : extractApiError(m.error)}
            </span>
            {blockingId != null && (
              <Button size="sm" variant="outline" onClick={() => navigate(`/inventory/stocktake/${blockingId}`)}>
                {ar.stocktake.resume}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PastStocktakes({ q }: { q: UseQueryResult<StocktakeListRow[]> }) {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader><CardTitle>{ar.stocktake.title}</CardTitle></CardHeader>
      <CardContent>
        {q.isLoading ? (
          <TableSkeleton rows={5} columns={6} />
        ) : q.isError ? (
          <ErrorBanner title="تعذر تحميل سجل الجرد" onRetry={() => q.refetch()} />
        ) : (q.data ?? []).length === 0 ? (
          <EmptyState title="لا توجد عمليات جرد سابقة" icon={ClipboardList} bordered={false} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ textAlign: 'center' }}>
              <thead className="text-xs text-foreground-muted uppercase tracking-wide">
                <tr className="border-b border-border-subtle">
                  <th className="py-2.5 font-medium">{ar.stocktake.stocktakeNo}</th>
                  <th className="font-medium">{ar.stocktake.warehouse}</th>
                  <th className="font-medium">{ar.stocktake.mode}</th>
                  <th className="font-medium">{ar.stocktake.state}</th>
                  <th className="font-medium">{ar.stocktake.summaryScanned}</th>
                  <th className="font-medium">{ar.stocktake.started}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((s) => {
                  const needsAction = s.status === 'open' || s.unresolved_count > 0;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => navigate(`/inventory/stocktake/${s.id}`)}
                      className="cursor-pointer border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150"
                    >
                      <td className="py-2.5 font-mono text-foreground" dir="ltr">{s.stocktake_no}</td>
                      <td>{ar.warehouses[s.warehouse]}</td>
                      <td>{s.mode === 'roll_level' ? ar.stocktake.rollLevel : ar.stocktake.aggregate}</td>
                      <td><StocktakeStatusPill s={s} /></td>
                      <td className="tabular-num">
                        {s.scanned_lines} / {s.total_lines}
                        {s.unexpected_lines > 0 && (
                          <span className="text-warning-foreground"> (+{s.unexpected_lines})</span>
                        )}
                      </td>
                      <td className="text-foreground-muted">{new Date(s.started_at).toLocaleString('ar-EG-u-nu-latn')}</td>
                      <td className="py-1.5">
                        <Button size="sm" variant={needsAction ? 'default' : 'outline'}>
                          {needsAction ? ar.stocktake.resume : ar.stocktake.open}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
