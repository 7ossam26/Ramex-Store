import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import type { ShipmentStatus } from '@/lib/inventory-types';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';

const STATUSES: Array<ShipmentStatus | ''> = [
  '', 'draft', 'pending_approval', 'partial_approved', 'approved', 'rejected', 'cancelled',
];

type ShipmentRow = {
  id: number;
  shipment_no: string;
  status: ShipmentStatus;
  created_at: string;
};

export function ShipmentsListPage({ defaultStatus }: { defaultStatus?: ShipmentStatus } = {}) {
  const [status, setStatus] = useState<ShipmentStatus | ''>(defaultStatus ?? '');
  const q = useQuery({
    queryKey: ['shipments', status],
    queryFn: () => inventoryApi.listShipments(status ? { status } : undefined),
  });

  const columns: Column<ShipmentRow>[] = [
    {
      key: 'shipment_no',
      header: ar.shipments.shipmentNo,
      cell: (s) => (
        <Link to={`/shipments/${s.id}`} className="text-primary underline font-mono">
          {s.shipment_no}
        </Link>
      ),
      primary: true,
    },
    {
      key: 'status',
      header: 'الحالة',
      cell: (s) => ar.shipments.status[s.status],
    },
    {
      key: 'created',
      header: 'تاريخ الإنشاء',
      cell: (s) => new Date(s.created_at).toLocaleString('ar-EG-u-nu-latn'),
      secondary: true,
    },
  ];

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h1 className="text-xl font-bold">
          {defaultStatus === 'pending_approval' ? ar.shipments.pending : ar.shipments.all}
        </h1>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ShipmentStatus | '')}
          className="h-11 md:h-9 rounded border border-border bg-canvas px-3 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? ar.shipments.status[s as ShipmentStatus] : ar.common.none}
            </option>
          ))}
        </select>
      </div>

      <ResponsiveTable
        columns={columns}
        rows={(q.data ?? []) as ShipmentRow[]}
        rowKey={(s) => String(s.id)}
        empty={ar.shipments.empty}
      />
    </div>
  );
}
