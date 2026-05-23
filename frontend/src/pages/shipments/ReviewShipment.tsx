import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import { extractApiError } from '@/lib/api-error';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/PageHeader';
import { ShipmentStatusPill } from '@/components/shipments/ShipmentStatusPill';
import { StatusPill, type StatusTone } from '@/components/StatusPill';
import type { ShipmentLineDetail } from '@/lib/inventory-types';

const LINE_STATUS_TONE: Record<string, StatusTone> = {
  pending: 'info',
  accepted: 'success',
  rejected: 'danger',
};

function formatEgp(value: number): string {
  return value.toFixed(2);
}

function previewTotal(line: ShipmentLineDetail, price: number): string | null {
  if (line.fabric_unit === 'meter') {
    if (!line.length_m) return null;
    return formatEgp(price * Number(line.length_m));
  }
  return formatEgp(price * Number(line.weight_kg));
}

export function ReviewShipmentPage() {
  const { id } = useParams<{ id: string }>();
  const shipmentId = Number(id);
  const qc = useQueryClient();

  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [fabricPrices, setFabricPrices] = useState<Record<number, string>>({});
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['shipment', shipmentId],
    queryFn: () => inventoryApi.getShipment(shipmentId),
  });

  const reviewLine = useMutation({
    mutationFn: ({
      lineId,
      action,
      reject_reason_ar,
    }: {
      lineId: number;
      action: 'accept' | 'reject';
      reject_reason_ar?: string;
    }) =>
      inventoryApi.reviewShipmentLine(shipmentId, lineId, {
        action,
        reject_reason_ar: reject_reason_ar ?? null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipment', shipmentId] }),
  });

  const accept = useMutation({
    mutationFn: (fabricReferencePrices: Array<{ fabricId: number; pricePerUnit: number }>) =>
      inventoryApi.acceptShipment(shipmentId, fabricReferencePrices),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipment', shipmentId] });
      setAcceptError(null);
    },
    onError: (e) => setAcceptError(extractApiError(e)),
  });

  if (!q.data) return <div>{ar.loading}</div>;
  const shipment = q.data;
  const isReviewable =
    shipment.status === 'pending_approval' || shipment.status === 'partial_approved';

  // Group lines by fabric_id — order preserved because service sorts by fabric_id then sl.id.
  const fabricGroups = shipment.lines.reduce<Map<number, ShipmentLineDetail[]>>((map, line) => {
    const existing = map.get(line.fabric_id);
    if (existing) existing.push(line);
    else map.set(line.fabric_id, [line]);
    return map;
  }, new Map());

  const allReviewed = shipment.lines.every((l) => l.status !== 'pending');

  // Fabrics that have at least one accepted line.
  const acceptedFabricIds = new Set(
    shipment.lines.filter((l) => l.status === 'accepted').map((l) => l.fabric_id),
  );

  const allFabricsPriced = [...acceptedFabricIds].every((fid) => {
    const raw = fabricPrices[fid]?.trim();
    return raw !== undefined && raw !== '' && Number(raw) >= 0;
  });

  const canConfirm = allReviewed && allFabricsPriced && !accept.isPending;

  let confirmTitle: string | undefined;
  if (!allReviewed) confirmTitle = ar.shipments.acceptShipmentBlockedReview;
  else if (!allFabricsPriced) confirmTitle = ar.shipments.acceptShipmentBlockedPrice;

  function handleConfirm() {
    const fabricReferencePrices = [...acceptedFabricIds].map((fabricId) => ({
      fabricId,
      pricePerUnit: Number(fabricPrices[fabricId]),
    }));
    accept.mutate(fabricReferencePrices);
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto" dir="rtl">
      <PageHeader
        title={shipment.shipment_no}
        backTo="/shipments"
        actions={<ShipmentStatusPill status={shipment.status} />}
      />

      {acceptError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {acceptError}
        </div>
      )}

      {[...fabricGroups.entries()].map(([fabricId, lines]) => {
        const firstLine = lines[0];
        const isKg = firstLine.fabric_unit === 'kg';
        const priceLabel = isKg ? ar.shipments.referencePriceKg : ar.shipments.referencePriceMeter;
        const unitSuffix = isKg ? 'كجم' : 'م';
        const hasAccepted = lines.some((l) => l.status === 'accepted');
        const rawPrice = fabricPrices[fabricId] ?? '';
        const priceNum = rawPrice.trim() !== '' ? Number(rawPrice) : NaN;

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

                {isReviewable && hasAccepted && (
                  <div className="flex flex-col gap-1 min-w-[180px]">
                    <Label
                      htmlFor={`price-${fabricId}`}
                      className="text-xs font-medium text-foreground"
                    >
                      {priceLabel} (ج.م/{unitSuffix})
                    </Label>
                    <Input
                      id={`price-${fabricId}`}
                      type="number"
                      inputMode="decimal"
                      step="1"
                      min="0"
                      value={rawPrice}
                      onChange={(e) =>
                        setFabricPrices((p) => ({ ...p, [fabricId]: e.target.value }))
                      }
                      placeholder={ar.shipments.referencePricePlaceholder}
                      className="w-40 text-left"
                      dir="ltr"
                    />
                  </div>
                )}

                {!isReviewable && (
                  <div className="text-sm text-foreground-muted">
                    {priceLabel}:{' '}
                    <span className="font-mono tabular-num" dir="ltr">
                      {lines.find((l) => l.reference_price_per_unit)?.reference_price_per_unit ?? '—'}
                    </span>{' '}
                    ج.م/{unitSuffix}
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <table className="w-full text-sm">
                <thead className="text-start text-xs text-foreground-muted uppercase tracking-wide">
                  <tr className="border-b border-border-subtle">
                    <th className="py-2 font-medium">{ar.stockMovements.rollBarcode}</th>
                    <th className="font-medium">{ar.shipments.rollColor}</th>
                    <th className="font-medium">
                      {isKg ? ar.shipments.rollWeight : 'الطول (م)'}
                    </th>
                    {!isReviewable && (
                      <th className="font-medium">{ar.shipments.previewTotal} (ج.م)</th>
                    )}
                    {isReviewable && !Number.isNaN(priceNum) && priceNum >= 0 && (
                      <th className="font-medium text-foreground-muted">
                        {ar.shipments.previewTotal} (ج.م)
                      </th>
                    )}
                    <th className="font-medium">الحالة</th>
                    {isReviewable && <th />}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const qty = isKg ? l.weight_kg : l.length_m;
                    const total =
                      !Number.isNaN(priceNum) && priceNum >= 0
                        ? previewTotal(l, priceNum)
                        : !isReviewable && l.reference_price_per_unit
                          ? previewTotal(l, Number(l.reference_price_per_unit))
                          : null;

                    return (
                      <tr
                        key={l.id}
                        className="border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150 align-middle"
                      >
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
                        {((!isReviewable) ||
                          (!Number.isNaN(priceNum) && priceNum >= 0)) && (
                          <td className="tabular-num text-foreground-muted" dir="ltr">
                            {total ?? '—'}
                          </td>
                        )}
                        <td>
                          <StatusPill tone={LINE_STATUS_TONE[l.status] ?? 'neutral'}>
                            {ar.shipments.lineStatus[l.status]}
                          </StatusPill>
                        </td>
                        {isReviewable && (
                          <td>
                            {l.status === 'pending' ? (
                              <div className="flex flex-col gap-1.5 py-1 min-w-[220px]">
                                <Input
                                  placeholder={ar.shipments.rejectReason}
                                  value={reasons[l.id] ?? ''}
                                  onChange={(e) =>
                                    setReasons((r) => ({ ...r, [l.id]: e.target.value }))
                                  }
                                  className="h-8 text-sm"
                                />
                                <div className="flex gap-1.5">
                                  <Button
                                    size="sm"
                                    className="h-8 cursor-pointer"
                                    disabled={reviewLine.isPending}
                                    onClick={() =>
                                      reviewLine.mutate({
                                        lineId: l.id,
                                        action: 'accept',
                                      })
                                    }
                                  >
                                    {ar.shipments.accept}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 cursor-pointer"
                                    disabled={reviewLine.isPending}
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

      {isReviewable && (
        <div className="flex justify-end pt-2">
          <Button
            size="lg"
            onClick={handleConfirm}
            disabled={!canConfirm}
            title={confirmTitle}
            className="min-w-[180px] cursor-pointer"
          >
            {accept.isPending ? 'جارٍ التأكيد...' : ar.shipments.acceptShipment}
          </Button>
        </div>
      )}
    </div>
  );
}
