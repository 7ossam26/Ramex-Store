import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ReviewShipmentPage() {
  const { id } = useParams<{ id: string }>();
  const shipmentId = Number(id);
  const qc = useQueryClient();
  const [reasons, setReasons] = useState<Record<number, string>>({});

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

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{shipment.shipment_no}</CardTitle>
          <span className="text-sm">{ar.shipments.status[shipment.status]}</span>
        </CardHeader>
        <CardContent>
          {isReviewable && (
            <div className="flex gap-2 mb-3">
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
          )}

          <table className="w-full text-sm">
            <thead className="text-right text-xs text-muted-foreground">
              <tr>
                <th className="py-2">{ar.stockMovements.rollBarcode}</th>
                <th>{ar.shipments.rollFabric}</th>
                <th>{ar.shipments.rollColor}</th>
                <th>{ar.shipments.rollWeight}</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shipment.lines.map((l) => (
                <tr key={l.id} className="border-t border-border align-top">
                  <td className="py-2 font-mono">{l.internal_barcode}</td>
                  <td>{l.fabric_name_ar}</td>
                  <td>{l.color_name_ar} ({l.color_code})</td>
                  <td>{l.weight_kg}</td>
                  <td>{ar.shipments.lineStatus[l.status]}</td>
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
                        <span className="text-xs text-muted-foreground">{l.reject_reason_ar}</span>
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
