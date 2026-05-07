import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import type { StockEventType } from '@/lib/inventory-types';
import { Button } from '@/components/ui/button';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';

const PAGE_SIZE = 50;

const ALL_EVENTS: StockEventType[] = [
  'factory_in', 'shipment_out', 'shipment_in', 'shipment_reject_back',
  'adjustment', 'damage', 'loss_writeoff', 'sample_set',
  'return_in', 'sale_out', 'reserve', 'unreserve',
];

type MovementRow = {
  id: number;
  created_at: string;
  event_type: StockEventType;
  internal_barcode: string;
  fabric_name_ar: string;
  color_name_ar: string;
  from_warehouse: string | null;
  to_warehouse: string | null;
  reference_type: string | null;
  reference_id: number | null;
};

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
  const rows: MovementRow[] = (q.data?.rows ?? []) as MovementRow[];

  const columns: Column<MovementRow>[] = [
    {
      key: 'when',
      header: ar.stockMovements.when,
      cell: (m) => new Date(m.created_at).toLocaleString('ar-EG-u-nu-latn'),
      secondary: true,
    },
    {
      key: 'event',
      header: ar.stockMovements.eventType,
      cell: (m) => ar.stockMovements.events[m.event_type],
      primary: true,
    },
    {
      key: 'barcode',
      header: ar.stockMovements.rollBarcode,
      cell: (m) => <span className="font-mono" dir="ltr">{m.internal_barcode}</span>,
    },
    {
      key: 'fc',
      header: ar.stockMovements.fabricColor,
      cell: (m) => `${m.fabric_name_ar} / ${m.color_name_ar}`,
    },
    {
      key: 'from',
      header: ar.stockMovements.from,
      cell: (m) => (m.from_warehouse ? ar.warehouses[m.from_warehouse as keyof typeof ar.warehouses] : '—'),
    },
    {
      key: 'to',
      header: ar.stockMovements.to,
      cell: (m) => (m.to_warehouse ? ar.warehouses[m.to_warehouse as keyof typeof ar.warehouses] : '—'),
    },
    {
      key: 'ref',
      header: ar.stockMovements.reference,
      cell: (m) => (
        <span className="text-xs text-muted-foreground">
          {m.reference_type ? `${m.reference_type}#${m.reference_id ?? ''}` : '—'}
        </span>
      ),
      hideOnMobile: true,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h1 className="text-xl font-bold">{ar.stockMovements.title}</h1>
        <select
          value={event}
          onChange={(e) => { setEvent(e.target.value as StockEventType | ''); setOffset(0); }}
          className="h-11 md:h-9 rounded border border-border bg-canvas px-3 text-sm"
        >
          <option value="">{ar.common.none}</option>
          {ALL_EVENTS.map((ev) => (
            <option key={ev} value={ev}>{ar.stockMovements.events[ev]}</option>
          ))}
        </select>
      </div>

      <ResponsiveTable
        columns={columns}
        rows={rows}
        rowKey={(m) => String(m.id)}
        empty={ar.common.none}
      />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
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
    </div>
  );
}
