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

  const [scanFlash, setScanFlash] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['shipment', shipmentId],
    queryFn: () => inventoryApi.getShipment(shipmentId),
  });

  const reviewLine = useMutation({
    mutationFn: ({ lineId, action, reject_reason_ar }: { lineId: number; action: 'accept' | 'reject'; reject_reason_ar?: string }) =>
      inventoryApi.reviewShipmentLine(shipmentId, lineId, { action, reject_reason_ar: reject_reason_ar ?? null }),
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

  const acceptAll = () => {
    for (const line of shipment.lines.filter((l) => l.status === 'pending')) {
      reviewLine.mutate({ lineId: line.id, action: 'accept' });
    }
  };

  function handleScanAccept(barcode: string) {
    const line = shipment.lines.find(
      (l) => l.status === 'pending' && l.internal_barcode === barcode,
    );
    if (!line) {
      setScanFlash(`غير موجود: ${barcode}`);
    } else {
      reviewLine.mutate(
        { lineId: line.id, action: 'accept' },
        { onSuccess: () => { setScanFlash(`✓ ${barcode}`); setTimeout(() => setScanFlash(null), 1000); } },
      );
    }
  }

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
              <div className="space-y-1">
                <Label className="text-sm font-medium text-foreground">{ar.labels.scanHint}</Label>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 max-w-sm">
                    <ScannerInput
                      onScan={handleScanAccept}
                      placeholder={ar.labels.scanHint}
                    />
                  </div>
                  {scanFlash && (
                    <span className={`text-xs font-mono tabular-num ${scanFlash.startsWith('✓') ? 'text-success-foreground' : 'text-danger'}`} dir="ltr">
                      {scanFlash}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={acceptAll} variant="outline">
                  {ar.shipments.bulkAccept}
                </Button>
                <Button
                  onClick={() => finalize.mutate()}
                  disabled={!allReviewed || finalize.isPending}
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
                <th className="font-medium">الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shipment.lines.map((l) => (
                <tr key={l.id} className="border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150 align-top">
                  <td className="py-2.5 font-mono tabular-num text-foreground">{l.internal_barcode}</td>
                  <td>{l.fabric_name_ar}</td>
                  <td>{l.color_name_ar} ({l.color_code})</td>
                  <td className="tabular-num" dir="ltr">{l.weight_kg}</td>
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
                          onChange={(e) => setReasons((r) => ({ ...r, [l.id]: e.target.value }))}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => reviewLine.mutate({ lineId: l.id, action: 'accept' })}
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
                        <span className="text-xs text-foreground-muted">{l.reject_reason_ar}</span>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
