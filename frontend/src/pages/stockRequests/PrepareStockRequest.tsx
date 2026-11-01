import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { stockRequestsApi } from '@/lib/stock-requests-api';
import { inventoryApi } from '@/lib/inventory-api';
import type { StockRequestItem } from '@/lib/stock-requests-types';
import { extractApiError } from '@/lib/api-error';
import { rollQtyLabel } from '@/lib/fabric-unit';
import { PageShell, SectionCard } from '@/components/Layout/PageShell';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ScannerInput } from '@/components/ScannerInput';
import { ReasonDialog } from '@/components/stockRequests/ReasonDialog';

/**
 * Factory side: scan every requested top onto the request's open draft shipment,
 * then send it. A top that was not requested is refused by the server; tops not
 * scanned simply stay in the request for a later shipment.
 */
export function PrepareStockRequestPage() {
  const { id } = useParams<{ id: string }>();
  const requestId = Number(id);
  const qc = useQueryClient();

  const [scanFlash, setScanFlash] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [unavailTarget, setUnavailTarget] = useState<StockRequestItem | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sentNo, setSentNo] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['stock-request', requestId],
    queryFn: () => stockRequestsApi.get(requestId),
    enabled: Number.isFinite(requestId),
    refetchOnMount: 'always',
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['stock-request', requestId] });
    qc.invalidateQueries({ queryKey: ['stock-requests'] });
    qc.invalidateQueries({ queryKey: ['shipments'] });
  };

  const draft = q.data?.draft_shipment ?? null;

  const openDraft = useMutation({
    mutationFn: () => stockRequestsApi.openDraft(requestId),
    onSuccess: () => { setError(null); setSentNo(null); refresh(); },
    onError: (e) => setError(extractApiError(e)),
  });

  const scan = useMutation({
    mutationFn: (barcode: string) => inventoryApi.addShipmentRollByBarcode(draft!.id, barcode),
    onSuccess: (_d, barcode) => {
      setScanError(null);
      setScanFlash(`✓ ${barcode}`);
      setTimeout(() => setScanFlash(null), 1200);
      refresh();
    },
    onError: (e, barcode) => {
      setScanFlash(null);
      setScanError(`${extractApiError(e)} (${barcode})`);
      setShakeKey((k) => k + 1);
    },
  });

  const unpack = useMutation({
    mutationFn: (lineId: number) => inventoryApi.removeShipmentLine(draft!.id, lineId),
    onSuccess: () => { setError(null); refresh(); },
    onError: (e) => setError(extractApiError(e)),
  });

  const unavailable = useMutation({
    mutationFn: (args: { itemId: number; reason: string }) => stockRequestsApi.markUnavailable(requestId, args.itemId, args.reason),
    onSuccess: () => { setUnavailTarget(null); setError(null); refresh(); },
  });

  const send = useMutation({
    mutationFn: () => inventoryApi.submitShipment(draft!.id),
    onSuccess: (s) => { setSentNo(s.shipment_no); setError(null); refresh(); },
    onError: (e) => setError(extractApiError(e)),
  });

  if (q.isLoading) return <div className="p-6">{ar.loading}</div>;
  if (q.isError || !q.data) return <div className="p-6 text-danger">{extractApiError(q.error)}</div>;

  const r = q.data;
  const inShipment = draft ? r.items.filter((i) => i.status === 'packing' && i.shipment_id === draft.id) : [];
  const waiting = r.items.filter((i) => i.status === 'requested');
  const closed = Boolean(r.cancelled_at) || r.status === 'cancelled';

  return (
    <PageShell
      title={ar.stockRequests.prepareTitle.replace('{no}', r.request_no)}
      description={ar.stockRequests.prepareHint}
      backTo={`/stock-requests/${r.id}`}
    >
      {error && <div className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}
      {sentNo && (
        <div className="rounded-md border border-success/40 bg-success-subtle px-4 py-3 text-sm text-success-foreground">
          {ar.stockRequests.shipmentSent.replace('{no}', sentNo)}
        </div>
      )}

      {!draft ? (
        <SectionCard>
          {waiting.length === 0 || closed ? (
            <div className="space-y-2">
              <p className="text-sm text-foreground-muted">{ar.stockRequests.nothingToPrepare}</p>
              <Link to={`/stock-requests/${r.id}`} className="text-sm text-accent underline">{ar.stockRequests.viewRequest}</Link>
            </div>
          ) : (
            <Button size="lg" onClick={() => openDraft.mutate()} disabled={openDraft.isPending}>
              {openDraft.isPending ? ar.loading : ar.stockRequests.startPreparing}
            </Button>
          )}
        </SectionCard>
      ) : (
        <>
          <SectionCard title={`${ar.shipments.shipmentNo}: ${draft.shipment_no}`}>
            <div className="space-y-2">
              <p className="text-lg font-semibold tabular-num" data-testid="prepare-counter">
                {ar.stockRequests.counter
                  .replace('{current}', String(inShipment.length))
                  .replace('{remaining}', String(waiting.length))}
              </p>
              <div key={shakeKey} className={scanError ? 'rmx-shake max-w-md' : 'max-w-md'}>
                <ScannerInput
                  autoFocus
                  disabled={scan.isPending}
                  placeholder={ar.stockRequests.scanPlaceholder}
                  onScan={(barcode) => scan.mutate(barcode)}
                  className={scanError ? 'border-danger' : scanFlash ? 'border-success' : undefined}
                />
              </div>
              {scanFlash && <p className="text-sm text-success-foreground font-mono" dir="ltr">{scanFlash}</p>}
              {scanError && <p className="text-sm text-danger font-medium" role="alert">{scanError}</p>}
            </div>
          </SectionCard>

          <SectionCard title={`${ar.stockRequests.inThisShipment} (${inShipment.length})`} noPadding>
            <ItemTable
              items={inShipment}
              action={(i) => (
                <Button size="sm" variant="ghost" disabled={unpack.isPending} onClick={() => i.line_id && unpack.mutate(i.line_id)}>
                  {ar.stockRequests.removeFromShipment}
                </Button>
              )}
            />
          </SectionCard>

          <div className="flex justify-end">
            <Button size="lg" disabled={inShipment.length === 0 || send.isPending} onClick={() => setConfirmSend(true)}>
              {send.isPending ? ar.loading : ar.stockRequests.sendShipment}
            </Button>
          </div>
        </>
      )}

      <SectionCard title={`${ar.stockRequests.notPrepared} (${waiting.length})`} noPadding>
        <ItemTable
          items={waiting}
          action={(i) => (
            <Button size="sm" variant="outline" className="text-danger" onClick={() => { unavailable.reset(); setUnavailTarget(i); }}>
              {ar.stockRequests.markUnavailable}
            </Button>
          )}
        />
      </SectionCard>

      <ReasonDialog
        open={!!unavailTarget}
        title={`${ar.stockRequests.markUnavailableTitle} — ${unavailTarget?.internal_barcode ?? ''}`}
        hint={ar.stockRequests.markUnavailableHint}
        pending={unavailable.isPending}
        error={unavailable.isError ? extractApiError(unavailable.error) : null}
        onSubmit={(reason) => unavailTarget && unavailable.mutate({ itemId: unavailTarget.id, reason })}
        onCancel={() => setUnavailTarget(null)}
      />

      <ConfirmDialog
        open={confirmSend}
        message={ar.stockRequests.confirmSendShipment.replace('{n}', String(inShipment.length))}
        onConfirm={() => { setConfirmSend(false); send.mutate(); }}
        onCancel={() => setConfirmSend(false)}
      />
    </PageShell>
  );
}

function ItemTable({ items, action }: { items: StockRequestItem[]; action: (i: StockRequestItem) => ReactNode }) {
  if (items.length === 0) return <p className="text-sm text-foreground-muted p-4">{ar.common.none}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-foreground-muted">
          <tr className="border-b border-border-subtle">
            <th className="py-2.5 px-4 font-medium text-start">{ar.stockMovements.rollBarcode}</th>
            <th className="font-medium text-start">{ar.shipments.rollFabric}</th>
            <th className="font-medium text-start">{ar.shipments.rollColor}</th>
            <th className="font-medium text-start">{ar.shipments.rollWeight}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60" data-testid={`prep-item-${i.id}`}>
              <td className="py-2.5 px-4 font-mono tabular-num" dir="ltr">{i.internal_barcode}</td>
              <td>{i.fabric_name_ar}</td>
              <td>{i.color_name_ar}</td>
              <td className="tabular-num" dir="ltr">{rollQtyLabel(i.weight_kg, i.length_m)}</td>
              <td className="text-end px-4">{action(i)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
