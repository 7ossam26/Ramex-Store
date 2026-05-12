import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import type { ShipmentStatus } from '@/lib/inventory-types';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { PageHeader } from '@/components/PageHeader';
import { ShipmentStatusPill } from '@/components/shipments/ShipmentStatusPill';

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

  const rows = (q.data ?? []) as ShipmentRow[];

  const columns: Column<ShipmentRow>[] = [
    {
      key: 'shipment_no',
      header: ar.shipments.shipmentNo,
      cell: (s) => (
        <Link to={`/shipments/${s.id}`} className="text-accent hover:text-accent-hover underline underline-offset-2 font-mono tabular-num">
          {s.shipment_no}
        </Link>
      ),
      primary: true,
    },
    {
      key: 'status',
      header: 'الحالة',
      cell: (s) => <ShipmentStatusPill status={s.status} />,
    },
    {
      key: 'created',
      header: 'تاريخ الإنشاء',
      cell: (s) => <span className="text-foreground-muted">{new Date(s.created_at).toLocaleString('ar-EG-u-nu-latn')}</span>,
      secondary: true,
    },
  ];

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <PageHeader
        title={defaultStatus === 'pending_approval' ? ar.shipments.pending : ar.shipments.all}
        actions={
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ShipmentStatus | '')}
            className="h-10 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s ? ar.shipments.status[s as ShipmentStatus] : ar.common.none}
              </option>
            ))}
          </select>
        }
      />

      <ResponsiveTable
        columns={columns}
        rows={rows}
        rowKey={(s) => String(s.id)}
        empty={ar.shipments.empty}
        isLoading={q.isLoading}
        isError={q.isError}
        onRetry={() => q.refetch()}
        resetKey={status}
      />
    </div>
  );
}
