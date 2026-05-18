import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScannerInput } from '@/components/ScannerInput';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/PageHeader';
import { ShipmentStatusPill } from '@/components/shipments/ShipmentStatusPill';
import { StatusPill, type StatusTone } from '@/components/StatusPill';

const LINE_STATUS_TONE: Record<string, StatusTone> = {
  pending: 'info',
  accepted: 'success',
  rejected: 'danger',
};

export function ReviewShipmentPage() {
  const { id } = useParams<{ id: string }>();
  const shipmentId = Number(id);
  const qc = useQueryClient();
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [bulkPrice, setBulkPrice] = useState<string>('');

  const [scanFlash, setScanFlash] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['shipment', shipmentId],
    queryFn: () => inventoryApi.getShipment(shipmentId),
  });

  const reviewLine = useMutation({
    mutationFn: ({
      lineId,
      action,
      reject_reason_ar,
      selling_price_egp,
    }: {
      lineId: number;
      action: 'accept' | 'reject';
      reject_reason_ar?: string;
      selling_price_egp?: number;
    }) =>
      inventoryApi.reviewShipmentLine(shipmentId, lineId, {
        action,
        reject_reason_ar: reject_reason_ar ?? null,
        selling_price_egp,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipment', shipmentId] }),
  });

  const finalize = useMutation({
    mutationFn: () => inventoryApi.finalizeShipment(shipmentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipment', shipmentId] }),
  });

  if (!q.data) return <div>{ar.loading}</div>;
  const shipment = q.data;
  const isReviewable =
    shipment.status === 'pending_approval' || shipment.status === 'partial_approved';
  const allReviewed = shipment.lines.every((l) => l.status !== 'pending');

  function priceForLine(lineId: number): number | undefined {
    const raw = prices[lineId];
    if (raw === undefined || raw.trim() === '') {
      const fallback = bulkPrice.trim();
      if (fallback === '') return undefined;
      const n = Number(fallback);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    }
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  function acceptAll() {
    const fallback = Number(bulkPrice.trim());
    if (!Number.isFinite(fallback) || fallback <= 0) return;
    for (const line of shipment.lines.filter((l) => l.status === 'pending')) {
      const price = priceForLine(line.id) ?? fallback;
      reviewLine.mutate({
        lineId: line.id,
        action: 'accept',
        selling_price_egp: price,
      });
    }
  }

  function handleScanAccept(barcode: string) {
    const line = shipment.lines.find(
      (l) => l.status === 'pending' && l.internal_barcode === barcode,
    );
    if (!line) {
      setScanFlash(`غير موجود: ${barcode}`);
      return;
    }
    const price = priceForLine(line.id);
    if (price === undefined) {
      setScanFlash(`${ar.shipments.priceRequiredForAccept}: ${barcode}`);
      return;
    }
    reviewLine.mutate(
      { lineId: line.id, action: 'accept', selling_price_egp: price },
      {
        onSuccess: () => {
          setScanFlash(`✓ ${barcode}`);
          setTimeout(() => setScanFlash(null), 1000);
        },
      },
    );
  }

  const finalizeBlocked =
    !allReviewed ||
    shipment.lines.some(
      (l) => l.status === 'accepted' && (l.selling_price_egp === null || l.selling_price_egp === undefined),
    );

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <PageHeader
        title={shipment.shipment_no}
        actions={<ShipmentStatusPill status={shipment.status} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>{ar.shipments.create}</CardTitle>
        </CardHeader>
        <CardContent>
          {isReviewable && (
            <div className="space-y-3 mb-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-foreground">
                    {ar.labels.scanHint}
                  </Label>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 max-w-sm">
                      <ScannerInput onScan={handleScanAccept} placeholder={ar.labels.scanHint} />
                    </div>
                    {scanFlash && (
                      <span
                        className={`text-xs font-mono tabular-num ${scanFlash.startsWith('✓') ? 'text-success-foreground' : 'text-danger'}`}
                        dir="ltr"
                      >
                        {scanFlash}
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium text-foreground">
                    {ar.shipments.bulkAcceptPrice}
                  </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={bulkPrice}
                    onChange={(e) => setBulkPrice(e.target.value)}
                    placeholder={ar.shipments.sellingPricePlaceholder}
                    dir="ltr"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={acceptAll}
                  variant="outline"
                  disabled={!bulkPrice.trim() || Number(bulkPrice) <= 0}
                >
                  {ar.shipments.bulkAccept}
                </Button>
                <Button
                  onClick={() => finalize.mutate()}
                  disabled={finalizeBlocked || finalize.isPending}
                  title={finalizeBlocked ? ar.shipments.finalizeBlockedNoPrice : undefined}
                >
                  {ar.shipments.finalize}
                </Button>
              </div>
            </div>
          )}

          <table className="w-full text-sm">
            <thead className="text-start text-xs text-foreground-muted uppercase tracking-wide">
              <tr className="border-b border-border-subtle">
                <th className="py-2.5 font-medium">{ar.stockMovements.rollBarcode}</th>
                <th className="font-medium">{ar.shipments.rollFabric}</th>
                <th className="font-medium">{ar.shipments.rollColor}</th>
                <th className="font-medium">{ar.shipments.rollWeight}</th>
                <th className="font-medium">{ar.shipments.sellingPriceLabel}</th>
                <th className="font-medium">الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shipment.lines.map((l) => {
                const linePrice = priceForLine(l.id);
                const canAccept = linePrice !== undefined && linePrice > 0;
                return (
                  <tr
                    key={l.id}
                    className="border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150 align-top"
                  >
                    <td className="py-2.5 font-mono tabular-num text-foreground">
                      {l.internal_barcode}
                    </td>
                    <td>{l.fabric_name_ar}</td>
                    <td>
                      {l.color_name_ar} ({l.color_code})
                    </td>
                    <td className="tabular-num" dir="ltr">
                      {l.weight_kg}
                    </td>
                    <td>
                      {isReviewable && l.status === 'pending' ? (
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={prices[l.id] ?? ''}
                          placeholder={bulkPrice || ar.shipments.sellingPricePlaceholder}
                          onChange={(e) =>
                            setPrices((p) => ({ ...p, [l.id]: e.target.value }))
                          }
                          className="w-24"
                          dir="ltr"
                        />
                      ) : (
                        <span className="tabular-num" dir="ltr">
                          {l.selling_price_egp ?? '—'}
                        </span>
                      )}
                    </td>
                    <td>
                      <StatusPill tone={LINE_STATUS_TONE[l.status] ?? 'neutral'}>
                        {ar.shipments.lineStatus[l.status]}
                      </StatusPill>
                    </td>
                    <td>
                      {isReviewable && l.status === 'pending' ? (
                        <div className="flex flex-col gap-2 w-64">
                          <Input
                            placeholder={ar.shipments.rejectReason}
                            value={reasons[l.id] ?? ''}
                            onChange={(e) =>
                              setReasons((r) => ({ ...r, [l.id]: e.target.value }))
                            }
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={!canAccept}
                              title={!canAccept ? ar.shipments.priceRequiredForAccept : undefined}
                              onClick={() =>
                                reviewLine.mutate({
                                  lineId: l.id,
                                  action: 'accept',
                                  selling_price_egp: linePrice,
                                })
                              }
                            >
                              {ar.shipments.accept}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                reviewLine.mutate({
                                  lineId: l.id,
                                  action: 'reject',
                                  reject_reason_ar: reasons[l.id] || undefined,
                                })
                              }
                            >
                              {ar.shipments.reject}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        l.reject_reason_ar && (
                          <span className="text-xs text-foreground-muted">
                            {l.reject_reason_ar}
                          </span>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
