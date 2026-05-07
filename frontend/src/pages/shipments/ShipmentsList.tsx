import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import type { ShipmentStatus } from '@/lib/inventory-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const STATUSES: Array<ShipmentStatus | ''> = [
  '', 'draft', 'pending_approval', 'partial_approved', 'approved', 'rejected', 'cancelled',
];

export function ShipmentsListPage({ defaultStatus }: { defaultStatus?: ShipmentStatus } = {}) {
  const [status, setStatus] = useState<ShipmentStatus | ''>(defaultStatus ?? '');
  const q = useQuery({
    queryKey: ['shipments', status],
    queryFn: () => inventoryApi.listShipments(status ? { status } : undefined),
  });

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>
            {defaultStatus === 'pending_approval' ? ar.shipments.pending : ar.shipments.all}
          </CardTitle>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ShipmentStatus | '')}
            className="h-9 rounded border border-border bg-canvas px-2 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s ? ar.shipments.status[s as ShipmentStatus] : ar.common.none}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardContent>
          {!q.data || q.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">{ar.shipments.empty}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-right text-xs text-muted-foreground">
                <tr>
                  <th className="py-2">{ar.shipments.shipmentNo}</th>
                  <th>الحالة</th>
                  <th>تاريخ الإنشاء</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="py-2 font-mono">
                      <Link to={`/shipments/${s.id}`} className="text-primary underline">
                        {s.shipment_no}
                      </Link>
                    </td>
                    <td>{ar.shipments.status[s.status]}</td>
                    <td>{new Date(s.created_at).toLocaleString('ar-EG-u-nu-latn')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
