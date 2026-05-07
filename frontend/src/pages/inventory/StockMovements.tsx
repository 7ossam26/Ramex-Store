import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import type { StockEventType } from '@/lib/inventory-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const PAGE_SIZE = 50;

const ALL_EVENTS: StockEventType[] = [
  'factory_in', 'shipment_out', 'shipment_in', 'shipment_reject_back',
  'adjustment', 'damage', 'loss_writeoff', 'sample_set',
  'return_in', 'sale_out', 'reserve', 'unreserve',
];

export function StockMovementsPage() {
  const [event, setEvent] = useState<StockEventType | ''>('');
  const [offset, setOffset] = useState(0);

  const q = useQuery({
    queryKey: ['stock-movements', event, offset],
    queryFn: () =>
      inventoryApi.listStockMovements({
        event_type: event || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  });

  const total = q.data?.total ?? 0;
  const rows = q.data?.rows ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{ar.stockMovements.title}</CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={event}
              onChange={(e) => { setEvent(e.target.value as StockEventType | ''); setOffset(0); }}
              className="h-9 rounded border border-border bg-canvas px-2 text-sm"
            >
              <option value="">{ar.common.none}</option>
              {ALL_EVENTS.map((ev) => (
                <option key={ev} value={ev}>{ar.stockMovements.events[ev]}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-right text-xs text-muted-foreground">
              <tr>
                <th className="py-2">{ar.stockMovements.when}</th>
                <th>{ar.stockMovements.eventType}</th>
                <th>{ar.stockMovements.rollBarcode}</th>
                <th>{ar.stockMovements.fabricColor}</th>
                <th>{ar.stockMovements.from}</th>
                <th>{ar.stockMovements.to}</th>
                <th>{ar.stockMovements.reference}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="py-2">{new Date(m.created_at).toLocaleString('ar-EG-u-nu-latn')}</td>
                  <td>{ar.stockMovements.events[m.event_type]}</td>
                  <td className="font-mono">{m.internal_barcode}</td>
                  <td>{m.fabric_name_ar} / {m.color_name_ar}</td>
                  <td>{m.from_warehouse ? ar.warehouses[m.from_warehouse] : '—'}</td>
                  <td>{m.to_warehouse ? ar.warehouses[m.to_warehouse] : '—'}</td>
                  <td className="text-xs text-muted-foreground">
                    {m.reference_type ? `${m.reference_type}#${m.reference_id ?? ''}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{rows.length} / {total}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={offset === 0}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
                السابق
              </Button>
              <Button size="sm" variant="outline" disabled={offset + rows.length >= total}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}>
                التالي
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
