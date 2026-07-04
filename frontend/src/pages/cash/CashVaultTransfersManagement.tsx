import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Check, X } from 'lucide-react';
import { financeApi } from '@/lib/finance-api';
import { usePermissions } from '@/lib/permissions';
import { ar } from '@/i18n/ar';
import { extractApiError } from '@/lib/api-error';
import type { CashVaultTransfer, CashVaultTransferStatus } from '@/lib/finance-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ResponsiveDialog';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { PageShell, SectionCard } from '@/components/Layout/PageShell';
import { FilterChip } from '@/components/FilterChip';
import { StatusPill, type StatusTone } from '@/components/StatusPill';

const PAGE_SIZE = 50;

const fmt = (n: string | number) =>
  Number(n).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (s: string) =>
  new Date(s).toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'rejected';

function statusTone(status: CashVaultTransferStatus): StatusTone {
  switch (status) {
    case 'pending': return 'warning';
    case 'confirmed': return 'success';
    case 'rejected': return 'danger';
    default: return 'neutral';
  }
}

export function CashVaultTransfersManagementPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canApprove = can('cash_vault_transfer', 'approve');
  const canCreate = can('cash_vault_transfer', 'write');

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const transfersQ = useQuery({
    queryKey: ['cash-vault-transfers', page, statusFilter],
    queryFn: () => financeApi.listVaultTransfers({ status: statusFilter, page, limit: PAGE_SIZE }),
  });

  const confirmMut = useMutation({
    mutationFn: (id: number) => financeApi.confirmVaultTransfer(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-vault-transfers'] });
      qc.invalidateQueries({ queryKey: ['cash-balance'] });
      qc.invalidateQueries({ queryKey: ['cash-movements'] });
      qc.invalidateQueries({ queryKey: ['general-vault-balance'] });
      qc.invalidateQueries({ queryKey: ['treasuries-overview'] });
      setConfirmError(null);
    },
    onError: (e) => setConfirmError(extractApiError(e)),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      financeApi.rejectVaultTransfer(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cash-vault-transfers'] });
      setRejectTarget(null);
      setRejectReason('');
      setRejectError(null);
    },
    onError: (e) => setRejectError(extractApiError(e)),
  });

  const totalPages = transfersQ.data ? Math.ceil(transfersQ.data.total / PAGE_SIZE) : 1;
  const rows: CashVaultTransfer[] = transfersQ.data?.rows ?? [];

  const columns: Column<CashVaultTransfer>[] = [
    {
      key: 'date',
      header: ar.vaultTransfers.date,
      cell: (t) => (
        <span className="whitespace-nowrap text-foreground-muted tabular-num" dir="ltr">
          {fmtDate(t.created_at)}
        </span>
      ),
      secondary: true,
    },
    {
      key: 'amount',
      header: ar.vaultTransfers.amount,
      cell: (t) => (
        <span className="tabular-num font-medium text-foreground" dir="ltr">
          {fmt(t.amount_egp)} <span className="text-foreground-tertiary text-xs">ج.م</span>
        </span>
      ),
      primary: true,
    },
    {
      key: 'status',
      header: 'الحالة',
      cell: (t) => (
        <StatusPill tone={statusTone(t.status)}>{ar.vaultTransfers.statuses[t.status]}</StatusPill>
      ),
    },
    {
      key: 'created_by',
      header: ar.vaultTransfers.createdBy,
      cell: (t) => <span className="text-foreground-muted">{t.created_by_username ?? '—'}</span>,
    },
    {
      key: 'reviewed_by',
      header: ar.vaultTransfers.reviewedBy,
      cell: (t) => <span className="text-foreground-muted">{t.reviewed_by_username ?? '—'}</span>,
      hideOnMobile: true,
    },
    {
      key: 'notes',
      header: ar.vaultTransfers.notes,
      cell: (t) => (
        <span className="text-foreground-muted">
          {t.status === 'rejected' && t.reject_reason_ar ? t.reject_reason_ar : t.notes_ar ?? '—'}
        </span>
      ),
      hideOnMobile: true,
    },
  ];

  const filters: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: ar.vaultTransfers.filters.all },
    { value: 'pending', label: ar.vaultTransfers.filters.pending },
    { value: 'confirmed', label: ar.vaultTransfers.filters.confirmed },
    { value: 'rejected', label: ar.vaultTransfers.filters.rejected },
  ];

  return (
    <PageShell
      title={ar.vaultTransfers.managementTitle}
      description={ar.vaultTransfers.managementDescription}
      backTo="/treasury"
      actions={
        canCreate && (
          <Button variant="accent" onClick={() => navigate('/cash-transfers/new')} className="gap-1.5">
            <Plus className="size-4" aria-hidden />
            {ar.vaultTransfers.create}
          </Button>
        )
      }
    >
      <div className="flex gap-2 overflow-x-auto -mx-3 md:mx-0 px-3 md:px-0">
        {filters.map((opt) => (
          <FilterChip
            key={opt.value}
            active={statusFilter === opt.value}
            onClick={() => {
              setStatusFilter(opt.value);
              setPage(1);
            }}
          >
            {opt.label}
          </FilterChip>
        ))}
      </div>

      {confirmError && (
        <p className="text-danger-foreground text-sm bg-danger-subtle rounded-md p-2.5">{confirmError}</p>
      )}

      <SectionCard noPadding>
        <ResponsiveTable
          columns={columns}
          rows={rows}
          rowKey={(t) => String(t.id)}
          empty={ar.vaultTransfers.empty}
          isLoading={transfersQ.isLoading}
          isError={transfersQ.isError}
          onRetry={() => transfersQ.refetch()}
          resetKey={statusFilter}
          rowClassName={(t) => (t.status === 'pending' ? 'bg-warning-subtle/30' : '')}
          actions={(t) => {
            if (!canApprove || t.status !== 'pending') return null;
            return (
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={confirmMut.isPending}
                  onClick={() => confirmMut.mutate(t.id)}
                  className="text-success-foreground border-success/40 hover:bg-success-subtle"
                  aria-label={ar.vaultTransfers.confirm}
                >
                  <Check className="size-4" aria-hidden />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRejectTarget(t.id)}
                  className="text-danger-foreground border-danger/40 hover:bg-danger-subtle"
                  aria-label={ar.vaultTransfers.reject}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            );
          }}
        />
      </SectionCard>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            السابق
          </Button>
          <span className="text-sm text-foreground-muted tabular-num" dir="ltr">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            التالي
          </Button>
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectTarget !== null} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{ar.vaultTransfers.rejectTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>
                {ar.vaultTransfers.rejectReason} <span className="text-danger">*</span>
              </Label>
              <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            </div>
            {rejectError && (
              <p className="text-danger-foreground text-sm bg-danger-subtle rounded-md p-2.5">{rejectError}</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  إلغاء
                </Button>
              </DialogClose>
              <Button
                variant="accent"
                disabled={!rejectReason.trim() || rejectMut.isPending}
                onClick={() =>
                  rejectTarget !== null && rejectMut.mutate({ id: rejectTarget, reason: rejectReason })
                }
                className="bg-danger hover:bg-danger/90"
              >
                {rejectMut.isPending ? 'جاري الرفض...' : ar.vaultTransfers.reject}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
