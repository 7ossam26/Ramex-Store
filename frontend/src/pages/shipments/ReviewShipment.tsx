import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import { extractApiError } from '@/lib/api-error';
import { usePermissions } from '@/lib/permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FilterChip } from '@/components/FilterChip';
import { ShipmentStatusPill } from '@/components/shipments/ShipmentStatusPill';
import { StatusPill, type StatusTone } from '@/components/StatusPill';
import type { ShipmentLineDetail } from '@/lib/inventory-types';

const LINE_STATUS_TONE: Record<string, StatusTone> = {
  pending: 'info',
  accepted: 'success',
  rejected: 'danger',
};

type ReviewAction = 'accept' | 'reject' | 'reset';

type LineFilter = 'received' | 'pending' | 'rejected' | 'all';

const FILTER_STATUS: Record<Exclude<LineFilter, 'all'>, ShipmentLineDetail['status']> = {
  received: 'accepted',
  pending: 'pending',
  rejected: 'rejected',
};

const checkboxClass = 'size-4 cursor-pointer accent-accent align-middle';

/** Header checkbox for a group of lines: checked / indeterminate / empty. */
function GroupCheckbox({
  ids,
  selected,
  onChange,
  label,
}: {
  ids: number[];
  selected: Set<number>;
  onChange: (ids: number[], checked: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const count = ids.filter((id) => selected.has(id)).length;
  const all = ids.length > 0 && count === ids.length;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = count > 0 && !all;
  }, [count, all]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className={checkboxClass}
      aria-label={label}
      checked={all}
      onChange={(e) => onChange(ids, e.target.checked)}
    />
  );
}

export function ReviewShipmentPage({ readOnly = false }: { readOnly?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const shipmentId = Number(id);
  const qc = useQueryClient();
  const { can, loading: permsLoading } = usePermissions();
  // Default to false (safe) while permissions are loading — prevents controls
  // from flashing for factory_sender before the permission fetch resolves.
  const canApprove = !permsLoading && can('shipments', 'approve');

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmRejectAll, setConfirmRejectAll] = useState(false);
  // null = not chosen yet: pending while there is something to receive, else received.
  const [lineFilter, setLineFilter] = useState<LineFilter | null>(null);

  const q = useQuery({
    queryKey: ['shipment', shipmentId],
    queryFn: () => inventoryApi.getShipment(shipmentId),
  });

  const review = useMutation({
    mutationFn: ({ ids, action }: { ids: number[]; action: ReviewAction }) =>
      inventoryApi.reviewShipmentLines(shipmentId, {
        line_ids: ids,
        action,
        reject_reason_ar: action === 'reject' ? reason.trim() || null : null,
      }),
    onSuccess: (_data, { action }) => {
      // A decision moves stock immediately, so stock views are stale too.
      for (const key of ['shipment', 'shipments', 'stock-summary', 'rolls-for-stock', 'rolls-search', 'stock-movements']) {
        qc.invalidateQueries({ queryKey: key === 'shipment' ? [key, shipmentId] : [key] });
      }
      setSelected(new Set());
      if (action === 'reject') setReason('');
      setError(null);
    },
    onError: (e) => setError(extractApiError(e)),
  });

  if (!q.data || permsLoading) return <div>{ar.loading}</div>;
  const shipment = q.data;
  // The طلبية closes itself once no توب is pending — only pending_approval can be reviewed.
  const isReviewable = shipment.status === 'pending_approval';
  const canReview = isReviewable && !readOnly && canApprove;

  const pendingIds = shipment.lines.filter((l) => l.status === 'pending').map((l) => l.id);
  const acceptedCount = shipment.lines.filter((l) => l.status === 'accepted').length;
  const rejectedCount = shipment.lines.filter((l) => l.status === 'rejected').length;

  const activeFilter: LineFilter = lineFilter ?? (canReview && pendingIds.length > 0 ? 'pending' : 'received');
  const visibleLines = activeFilter === 'all'
    ? shipment.lines
    : shipment.lines.filter((l) => l.status === FILTER_STATUS[activeFilter]);
  const filterCounts: Record<LineFilter, number> = {
    received: acceptedCount,
    pending: pendingIds.length,
    rejected: rejectedCount,
    all: shipment.lines.length,
  };

  // Group lines by fabric_id — order preserved because service sorts by fabric_id then sl.id.
  const fabricGroups = visibleLines.reduce<Map<number, ShipmentLineDetail[]>>((map, line) => {
    const existing = map.get(line.fabric_id);
    if (existing) existing.push(line);
    else map.set(line.fabric_id, [line]);
    return map;
  }, new Map());

  const allLineIds = visibleLines.map((l) => l.id);

  const selectedLines = shipment.lines.filter((l) => selected.has(l.id));
  const selectedPending = selectedLines.filter((l) => l.status === 'pending').map((l) => l.id);
  const selectedDecided = selectedLines.filter((l) => l.status !== 'pending').map((l) => l.id);

  const busy = review.isPending;

  function run(ids: number[], action: ReviewAction) {
    if (ids.length === 0) return;
    review.mutate({ ids, action });
  }

  function toggle(ids: number[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const lineId of ids) {
        if (checked) next.add(lineId);
        else next.delete(lineId);
      }
      return next;
    });
  }

  const summary = ar.shipments.reviewSummary
    .replace('{accepted}', String(acceptedCount))
    .replace('{rejected}', String(rejectedCount))
    .replace('{pending}', String(pendingIds.length));

  return (
    <div className="space-y-4 max-w-5xl mx-auto" dir="rtl">
      <PageHeader
        title={shipment.shipment_no}
        backTo="/shipments"
        actions={<ShipmentStatusPill status={shipment.status} />}
      />

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(['received', 'pending', 'rejected', 'all'] as const).map((f) => (
          <FilterChip
            key={f}
            active={activeFilter === f}
            onClick={() => {
              setLineFilter(f);
              setSelected(new Set());
            }}
          >
            {ar.shipments.lineFilter[f]} ({filterCounts[f]})
          </FilterChip>
        ))}
      </div>

      {canReview && (
        <p className="text-sm text-foreground-muted">{ar.shipments.receiveHint}</p>
      )}

      {canReview && (
        <div className="sticky top-0 z-sticky rounded-lg border border-border-default bg-surface-elevated p-3 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <GroupCheckbox
                ids={allLineIds}
                selected={selected}
                onChange={toggle}
                label={ar.shipments.selectAll}
              />
              {ar.shipments.selectAll}
            </label>
            <span className="text-sm text-foreground-muted tabular-num">{summary}</span>
            <div className="flex flex-wrap gap-2 ms-auto">
              <Button
                size="sm"
                className="cursor-pointer"
                disabled={busy || pendingIds.length === 0}
                onClick={() => run(pendingIds, 'accept')}
              >
                {ar.shipments.acceptAll} ({pendingIds.length})
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="cursor-pointer"
                disabled={busy || pendingIds.length === 0}
                onClick={() => setConfirmRejectAll(true)}
              >
                {ar.shipments.rejectAll} ({pendingIds.length})
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder={ar.shipments.rejectReasonOptional}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-8 text-sm flex-1 min-w-[200px]"
              maxLength={500}
            />
            {selected.size > 0 && (
              <>
                <span className="text-sm font-medium tabular-num">
                  {ar.shipments.selectedCount.replace('{n}', String(selected.size))}
                </span>
                <Button
                  size="sm"
                  className="cursor-pointer"
                  disabled={busy || selectedPending.length === 0}
                  onClick={() => run(selectedPending, 'accept')}
                >
                  {ar.shipments.acceptSelected} ({selectedPending.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="cursor-pointer"
                  disabled={busy || selectedPending.length === 0}
                  onClick={() => run(selectedPending, 'reject')}
                >
                  {ar.shipments.rejectSelected} ({selectedPending.length})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="cursor-pointer"
                  disabled={busy || selectedDecided.length === 0}
                  onClick={() => run(selectedDecided, 'reset')}
                >
                  {ar.shipments.undoSelected} ({selectedDecided.length})
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="cursor-pointer"
                  disabled={busy}
                  onClick={() => setSelected(new Set())}
                >
                  {ar.shipments.clearSelection}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {visibleLines.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-foreground-muted">
            {ar.shipments.noLinesInFilter}
          </CardContent>
        </Card>
      )}

      {[...fabricGroups.entries()].map(([fabricId, lines]) => {
        const firstLine = lines[0];
        const isKg = firstLine.fabric_unit === 'kg';

        return (
          <Card key={fabricId}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <CardTitle className="text-base font-semibold">
                  {firstLine.fabric_name_ar}
                  <span className="mr-2 text-xs font-normal text-foreground-muted">
                    ({isKg ? 'كيلو' : 'متر'})
                  </span>
                </CardTitle>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <table className="w-full text-sm">
                <thead className="text-start text-xs text-foreground-muted uppercase tracking-wide">
                  <tr className="border-b border-border-subtle">
                    {canReview && (
                      <th className="py-2 w-8">
                        <GroupCheckbox
                          ids={lines.map((l) => l.id)}
                          selected={selected}
                          onChange={toggle}
                          label={`${ar.shipments.selectAll} — ${firstLine.fabric_name_ar}`}
                        />
                      </th>
                    )}
                    <th className="py-2 font-medium">{ar.stockMovements.rollBarcode}</th>
                    <th className="font-medium">{ar.shipments.rollColor}</th>
                    <th className="font-medium">
                      {isKg ? ar.shipments.rollWeight : 'الطول (م)'}
                    </th>
                    <th className="font-medium">الحالة</th>
                    {(canReview || lines.some((l) => l.reject_reason_ar)) && <th />}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const qty = isKg ? l.weight_kg : l.length_m;
                    const isSelected = selected.has(l.id);

                    return (
                      <tr
                        key={l.id}
                        className={`border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150 align-middle ${isSelected ? 'bg-accent-subtle/60' : ''}`}
                      >
                        {canReview && (
                          <td className="py-2.5">
                            <input
                              type="checkbox"
                              className={checkboxClass}
                              aria-label={l.internal_barcode}
                              checked={isSelected}
                              onChange={(e) => toggle([l.id], e.target.checked)}
                            />
                          </td>
                        )}
                        <td className="py-2.5 font-mono tabular-num text-foreground text-xs">
                          {l.internal_barcode}
                        </td>
                        <td>
                          {l.color_name_ar}
                          <span className="text-foreground-muted text-xs mr-1">
                            ({l.color_code})
                          </span>
                        </td>
                        <td className="tabular-num" dir="ltr">
                          {qty ?? '—'}
                        </td>
                        <td>
                          <StatusPill tone={LINE_STATUS_TONE[l.status] ?? 'neutral'}>
                            {ar.shipments.lineStatus[l.status]}
                          </StatusPill>
                        </td>
                        {(canReview || lines.some((x) => x.reject_reason_ar)) && (
                          <td>
                            <div className="flex flex-wrap items-center gap-1.5 py-1">
                              {canReview && l.status === 'pending' && (
                                <>
                                  <Button
                                    size="sm"
                                    className="h-8 cursor-pointer"
                                    disabled={busy}
                                    onClick={() => run([l.id], 'accept')}
                                  >
                                    {ar.shipments.accept}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 cursor-pointer"
                                    disabled={busy}
                                    onClick={() => run([l.id], 'reject')}
                                  >
                                    {ar.shipments.reject}
                                  </Button>
                                </>
                              )}
                              {l.reject_reason_ar && (
                                <span className="text-xs text-foreground-muted">
                                  {l.reject_reason_ar}
                                </span>
                              )}
                              {canReview && l.status !== 'pending' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 cursor-pointer"
                                  disabled={busy}
                                  onClick={() => run([l.id], 'reset')}
                                >
                                  {ar.shipments.undo}
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        );
      })}

      {canReview && (
        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <span className="text-sm text-foreground-muted tabular-num">{summary}</span>
        </div>
      )}

      <ConfirmDialog
        open={confirmRejectAll}
        message={ar.shipments.confirmRejectAll.replace('{n}', String(pendingIds.length))}
        onConfirm={() => {
          setConfirmRejectAll(false);
          run(pendingIds, 'reject');
        }}
        onCancel={() => setConfirmRejectAll(false)}
      />
    </div>
  );
}
