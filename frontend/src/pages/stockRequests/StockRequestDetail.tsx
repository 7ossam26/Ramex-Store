import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, PackageCheck, Repeat, RotateCcw, XCircle } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { stockRequestsApi } from '@/lib/stock-requests-api';
import type { AvailableRoll, StockRequestItem } from '@/lib/stock-requests-types';
import { extractApiError } from '@/lib/api-error';
import { rollQtyLabel } from '@/lib/fabric-unit';
import { usePermissions } from '@/lib/permissions';
import { PageShell, SectionCard } from '@/components/Layout/PageShell';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ShipmentStatusPill } from '@/components/shipments/ShipmentStatusPill';
import { ItemOutcomePill, StockRequestStatusPill } from '@/components/stockRequests/StockRequestPills';
import { ReasonDialog } from '@/components/stockRequests/ReasonDialog';
import { AvailableRollsPicker } from '@/components/stockRequests/AvailableRollsPicker';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('ar-EG-u-nu-latn') : '—');

/** Every item of a request, in every state, with its full history. */
export function StockRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const requestId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can, loading: permsLoading } = usePermissions();
  const canRequest = !permsLoading && can('stock_requests', 'write');
  const canPrepare = !permsLoading && can('stock_request_fulfilment', 'write');

  const [error, setError] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<Set<number>>(new Set());
  const [cancelItemTarget, setCancelItemTarget] = useState<StockRequestItem | null>(null);
  const [cancelRequestOpen, setCancelRequestOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<StockRequestItem | null>(null);

  const q = useQuery({ queryKey: ['stock-request', requestId], queryFn: () => stockRequestsApi.get(requestId), enabled: Number.isFinite(requestId) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['stock-request', requestId] });
    qc.invalidateQueries({ queryKey: ['stock-requests'] });
    qc.invalidateQueries({ queryKey: ['stock-request-available'] });
  };
  const onErr = (e: unknown) => setError(extractApiError(e));

  const cancelItem = useMutation({
    mutationFn: (itemId: number) => stockRequestsApi.cancelItem(requestId, itemId),
    onSuccess: () => { setCancelItemTarget(null); setError(null); refresh(); },
    onError: (e) => { setCancelItemTarget(null); onErr(e); },
  });
  const cancelRequest = useMutation({
    mutationFn: (reason: string) => stockRequestsApi.cancel(requestId, reason),
    onSuccess: () => { setCancelRequestOpen(false); setError(null); refresh(); },
    onError: onErr,
  });
  const replace = useMutation({
    mutationFn: (args: { rollId: number; replaces: number }) =>
      stockRequestsApi.addItems(requestId, { roll_ids: [args.rollId], replaces_item_id: args.replaces }),
    onSuccess: () => { setReplaceTarget(null); setError(null); refresh(); },
    onError: (e) => { setReplaceTarget(null); onErr(e); },
  });

  const r = q.data;
  const itemsById = useMemo(() => new Map((r?.items ?? []).map((i) => [Number(i.id), i])), [r]);

  if (q.isLoading) return <div className="p-6">{ar.loading}</div>;
  if (q.isError || !r) return <div className="p-6 text-danger">{extractApiError(q.error)}</div>;

  const closed = Boolean(r.cancelled_at) || r.status === 'cancelled';
  const hasWaiting = r.items.some((i) => i.status === 'requested');

  const toggleHistory = (itemId: number) =>
    setOpenHistory((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });

  return (
    <PageShell
      title={`${ar.stockRequests.requestNo} ${r.request_no}`}
      description={`${ar.stockRequests.requestedBy}: ${r.requested_by_name} · ${fmt(r.created_at)}`}
      backTo="/stock-requests"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <StockRequestStatusPill status={r.status} />
          {canPrepare && !closed && (hasWaiting || r.draft_shipment) && (
            <Button size="sm" onClick={() => navigate(`/stock-requests/${r.id}/prepare`)}>
              <PackageCheck className="size-4" /> {ar.stockRequests.prepare}
            </Button>
          )}
          {canRequest && !closed && hasWaiting && (
            <Button size="sm" variant="outline" className="text-danger" onClick={() => setCancelRequestOpen(true)}>
              <XCircle className="size-4" /> {ar.stockRequests.cancelRequest}
            </Button>
          )}
        </div>
      }
    >
      {error && <div className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}
      {r.cancelled_at && (
        <div className="rounded-md border border-border-subtle bg-surface-row-alt px-4 py-3 text-sm">
          {ar.stockRequests.cancelledInfo.replace('{reason}', r.cancel_reason_ar ?? '')}
        </div>
      )}
      {r.notes_ar && <p className="text-sm text-foreground-muted">{ar.stockRequests.notes}: {r.notes_ar}</p>}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-center">
        {[
          [ar.stockRequests.counts.total, r.counts.total - r.counts.cancelled],
          [ar.stockRequests.counts.waiting, r.counts.requested + r.counts.packing],
          [ar.stockRequests.counts.shipped, r.counts.dispatched],
          [ar.stockRequests.counts.accepted, r.counts.accepted],
          [ar.stockRequests.counts.rejected, r.counts.rejected],
          [ar.stockRequests.counts.unavailable, r.counts.unavailable],
        ].map(([label, n]) => (
          <div key={String(label)} className="rounded-md border border-border-subtle bg-surface-elevated p-2">
            <div className="text-xs text-foreground-muted">{label}</div>
            <div className="text-xl font-semibold tabular-num">{n}</div>
          </div>
        ))}
      </div>

      <SectionCard title={ar.stockRequests.itemsTitle} noPadding>
        <ul className="divide-y divide-border-subtle">
          {r.items.map((item) => {
            const replaces = item.replaces_item_id ? itemsById.get(item.replaces_item_id) : undefined;
            return (
              <li key={item.id} className="px-4 py-3 space-y-1" data-testid={`item-${item.id}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono tabular-num text-sm" dir="ltr">{item.internal_barcode}</span>
                  <span className="text-sm">{item.fabric_name_ar} — {item.color_name_ar}</span>
                  <span className="text-sm tabular-num text-foreground-muted" dir="ltr">{rollQtyLabel(item.weight_kg, item.length_m)}</span>
                  <ItemOutcomePill outcome={item.outcome} />
                  {item.shipment_no && item.shipment_id && (
                    <Link to={`/shipments/${item.shipment_id}`} className="text-xs text-accent underline underline-offset-2" dir="ltr">
                      {ar.stockRequests.shipmentLine.replace('{no}', item.shipment_no)}
                    </Link>
                  )}
                  <span className="text-xs text-foreground-muted">#{item.id}</span>

                  <div className="ms-auto flex gap-1">
                    {canRequest && item.can_replace && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setReplaceTarget(item)}>
                          <Repeat className="size-4" /> {ar.stockRequests.requestReplacement}
                        </Button>
                        {item.outcome !== 'accepted' && item.roll_warehouse === 'factory' && item.roll_status === 'in_stock' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={replace.isPending}
                            onClick={() => replace.mutate({ rollId: item.roll_id, replaces: item.id })}
                          >
                            <RotateCcw className="size-4" /> {ar.stockRequests.retrySame}
                          </Button>
                        )}
                      </>
                    )}
                    {canRequest && item.status === 'requested' && !closed && (
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setCancelItemTarget(item)}>
                        {ar.stockRequests.cancelItem}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => toggleHistory(item.id)} aria-label={ar.stockRequests.history}>
                      <History className="size-4" />
                    </Button>
                  </div>
                </div>

                {item.status === 'requested' && !item.live_available && (
                  <p className="text-xs text-danger">{ar.stockRequests.noLongerAvailable}</p>
                )}
                {item.outcome === 'rejected' && item.reject_reason_ar && (
                  <p className="text-xs text-foreground-muted">{ar.stockRequests.rejectReason}: {item.reject_reason_ar}</p>
                )}
                {item.status === 'unavailable' && (
                  <p className="text-xs text-foreground-muted">
                    {ar.stockRequests.unavailableReason}: {item.unavailable_reason_ar}
                    {item.auto_unavailable ? ` (${ar.stockRequests.autoUnavailable})` : item.unavailable_by_name ? ` — ${item.unavailable_by_name}` : ''}
                  </p>
                )}
                {replaces && (
                  <p className="text-xs text-foreground-muted">
                    {ar.stockRequests.replacementFor.replace('{id}', String(replaces.id))} ({replaces.internal_barcode} — {ar.stockRequests.outcome[replaces.outcome]})
                  </p>
                )}
                {item.replaced_by_item_id && (
                  <p className="text-xs text-foreground-muted">{ar.stockRequests.replacedBy.replace('{id}', String(item.replaced_by_item_id))}</p>
                )}

                {openHistory.has(item.id) && (
                  <ol className="mt-2 border-s-2 border-border-subtle ps-3 space-y-1">
                    {item.events.map((e) => (
                      <li key={e.id} className="text-xs">
                        <span className="text-foreground-muted tabular-num">{fmt(e.created_at)}</span>{' '}
                        <span className="font-medium">{ar.stockRequests.events[e.event_type] ?? e.event_type}</span>
                        {e.actor_name && <span className="text-foreground-muted"> — {e.actor_name}</span>}
                        {e.note_ar && <span className="text-foreground-muted"> — {e.note_ar}</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <SectionCard title={ar.stockRequests.shipmentsTitle}>
        {r.shipments.length === 0 ? (
          <p className="text-sm text-foreground-muted">{ar.stockRequests.noShipments}</p>
        ) : (
          <ul className="space-y-2">
            {r.shipments.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 text-sm">
                <Link to={`/shipments/${s.id}`} className="font-mono text-accent underline underline-offset-2" dir="ltr">{s.shipment_no}</Link>
                <ShipmentStatusPill status={s.status} />
                <span className="text-foreground-muted tabular-num">
                  {ar.shipments.receivedOf.replace('{accepted}', String(s.accepted_count)).replace('{total}', String(s.line_count))}
                </span>
                <span className="text-foreground-muted">{fmt(s.submitted_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <ConfirmDialog
        open={!!cancelItemTarget}
        message={`${ar.stockRequests.confirmCancelItem}\n${cancelItemTarget?.internal_barcode ?? ''}`}
        onConfirm={() => cancelItemTarget && cancelItem.mutate(cancelItemTarget.id)}
        onCancel={() => setCancelItemTarget(null)}
      />

      <ReasonDialog
        open={cancelRequestOpen}
        title={ar.stockRequests.cancelRequestTitle}
        hint={ar.stockRequests.cancelRequestHint}
        pending={cancelRequest.isPending}
        error={cancelRequest.isError ? extractApiError(cancelRequest.error) : null}
        onSubmit={(reason) => cancelRequest.mutate(reason)}
        onCancel={() => setCancelRequestOpen(false)}
      />

      <Dialog open={!!replaceTarget} onOpenChange={(v) => { if (!v) setReplaceTarget(null); }}>
        <DialogContent className="max-w-4xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{ar.stockRequests.replacementTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground-muted">{ar.stockRequests.replacementHint}</p>
          {replaceTarget && (
            <AvailableRollsPicker
              selectedIds={new Set<number>()}
              initialFabricId={replaceTarget.fabric_id}
              onToggle={(roll: AvailableRoll) => replace.mutate({ rollId: Number(roll.id), replaces: replaceTarget.id })}
            />
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
