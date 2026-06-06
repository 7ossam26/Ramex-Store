import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import type { ShipmentStatus } from '@/lib/inventory-types';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { PageShell, SectionCard } from '@/components/Layout/PageShell';
import { ShipmentStatusPill } from '@/components/shipments/ShipmentStatusPill';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { usePermissions } from '@/lib/permissions';

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
  const [pendingDelete, setPendingDelete] = useState<ShipmentRow | null>(null);
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canApprove = can('shipments', 'approve');

  function shipmentUrl(s: ShipmentRow): string {
    if (canApprove && (s.status === 'pending_approval' || s.status === 'partial_approved')) {
      return `/shipments/${s.id}`;
    }
    return `/shipments/${s.id}/view`;
  }
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['shipments', status],
    queryFn: () => inventoryApi.listShipments(status ? { status } : undefined),
  });

  const deleteDraft = useMutation({
    mutationFn: (id: number) => inventoryApi.deleteShipmentDraft(id),
    onSuccess: () => {
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ['shipments'] });
    },
  });

  const rows = (q.data ?? []) as ShipmentRow[];

  const columns: Column<ShipmentRow>[] = [
    {
      key: 'shipment_no',
      header: ar.shipments.shipmentNo,
      cell: (s) => (
        <Link to={shipmentUrl(s)} className="text-accent hover:text-accent-hover underline underline-offset-2 font-mono tabular-num">
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
    <PageShell
      title={defaultStatus === 'pending_approval' ? ar.shipments.pending : ar.shipments.all}
      backTo="/shipments"
      actions={
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ShipmentStatus | '')}
          className="h-10 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors duration-75"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s ? ar.shipments.status[s as ShipmentStatus] : ar.shipments.allStatuses}
            </option>
          ))}
        </select>
      }
    >
      <SectionCard noPadding>
      <ResponsiveTable
        columns={columns}
        rows={rows}
        rowKey={(s) => String(s.id)}
        empty={ar.shipments.empty}
        isLoading={q.isLoading}
        isError={q.isError}
        onRetry={() => q.refetch()}
        resetKey={status}
        actions={(s) => (
          <div className="flex gap-1 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(shipmentUrl(s))}
              title={ar.shipments.view}
              aria-label={ar.shipments.view}
            >
              <Eye className="size-4" />
            </Button>
            {s.status === 'draft' && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/shipments/${s.id}/continue`)}
                  title={ar.shipments.continueDraft}
                  aria-label={ar.shipments.continueDraft}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPendingDelete(s)}
                  title={ar.shipments.deleteDraft}
                  aria-label={ar.shipments.deleteDraft}
                  className="text-danger hover:text-danger"
                >
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
          </div>
        )}
      />
      </SectionCard>

      <ConfirmDialog
        open={!!pendingDelete}
        message={
          pendingDelete
            ? `${ar.shipments.confirmDelete}\n${pendingDelete.shipment_no}`
            : ''
        }
        onConfirm={() => pendingDelete && deleteDraft.mutate(pendingDelete.id)}
        onCancel={() => setPendingDelete(null)}
      />
    </PageShell>
  );
}
