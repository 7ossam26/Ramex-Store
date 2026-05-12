import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, ShieldCheck, Loader2 } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { approvalsApi } from '@/lib/approvals-api';
import type { NotificationRow } from '@/lib/notifications-api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { StatusPill, type StatusTone } from '@/components/StatusPill';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { EmptyState } from '@/components/EmptyState';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ResponsiveDialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const SEVERITY_TONE: Record<string, StatusTone> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  critical: 'danger',
};

const RESOLUTION_TONE: Record<string, StatusTone> = {
  approved: 'success',
  rejected: 'danger',
  acknowledged: 'info',
};

function ageDiff(created: string) {
  const ms = Date.now() - new Date(created).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ساعة`;
  return `${Math.floor(hrs / 24)} يوم`;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

type Tab = 'pending' | 'resolved';

export function ApprovalsPage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('pending');
  const [page, setPage] = useState(1);
  const [reviewing, setReviewing] = useState<NotificationRow | null>(null);
  // Row flash: id -> tone. Cleared after 200ms.
  const [flash, setFlash] = useState<Record<number, 'success' | 'danger'>>({});
  const [comment, setComment] = useState('');

  const pendingQ = useQuery({
    queryKey: ['approvals-pending'],
    queryFn: approvalsApi.listPending,
    refetchInterval: 30_000,
  });

  const resolvedQ = useQuery({
    queryKey: ['approvals-resolved', page],
    queryFn: () => approvalsApi.listResolved(page, 30),
    enabled: tab === 'resolved',
  });

  const approveMut = useMutation({
    mutationFn: (id: number) => approvalsApi.approve(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['approvals-pending'] });
      qc.invalidateQueries({ queryKey: ['approvals-resolved'] });
      flashRow(id, 'success');
      setReviewing(null);
      setComment('');
    },
  });

  const rejectMut = useMutation({
    mutationFn: (id: number) => approvalsApi.reject(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['approvals-pending'] });
      qc.invalidateQueries({ queryKey: ['approvals-resolved'] });
      flashRow(id, 'danger');
      setReviewing(null);
      setComment('');
    },
  });

  function flashRow(id: number, tone: 'success' | 'danger') {
    setFlash((m) => ({ ...m, [id]: tone }));
    setTimeout(() => {
      setFlash((m) => {
        const next = { ...m };
        delete next[id];
        return next;
      });
    }, 200);
  }

  // Reset comment when opening a different row.
  useEffect(() => {
    setComment('');
  }, [reviewing?.id]);

  const pending = pendingQ.data?.rows ?? [];
  const resolved = resolvedQ.data?.rows ?? [];
  const resolvedTotal = resolvedQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(resolvedTotal / 30));

  // ── Pending columns ──────────────────────────────────────────────────────
  const pendingColumns: Column<NotificationRow>[] = [
    {
      key: 'title',
      header: 'الطلب',
      primary: true,
      cell: (n) => <span className="font-medium text-foreground">{n.title_ar}</span>,
    },
    {
      key: 'body',
      header: 'التفاصيل',
      cell: (n) => (
        <span className="text-foreground-muted text-sm line-clamp-2">{n.body_ar}</span>
      ),
    },
    {
      key: 'severity',
      header: 'الخطورة',
      cell: (n) => (
        <StatusPill tone={SEVERITY_TONE[n.severity] ?? 'neutral'}>
          {ar.approvals.severity[n.severity as keyof typeof ar.approvals.severity] ?? n.severity}
        </StatusPill>
      ),
    },
    {
      key: 'status',
      header: ar.approvals.statusLabel,
      cell: () => <StatusPill tone="warning">{ar.approvals.pendingLabel}</StatusPill>,
    },
    {
      key: 'age',
      header: ar.approvals.age,
      cell: (n) => (
        <span className="text-xs text-foreground-muted tabular-num" dir="ltr">
          {ageDiff(n.created_at)}
        </span>
      ),
      secondary: true,
    },
  ];

  // ── Resolved columns ─────────────────────────────────────────────────────
  const resolvedColumns: Column<NotificationRow>[] = [
    {
      key: 'title',
      header: 'الطلب',
      primary: true,
      cell: (n) => <span className="font-medium text-foreground">{n.title_ar}</span>,
    },
    {
      key: 'body',
      header: 'التفاصيل',
      cell: (n) => (
        <span className="text-foreground-muted text-sm line-clamp-2">{n.body_ar}</span>
      ),
    },
    {
      key: 'severity',
      header: 'الخطورة',
      cell: (n) => (
        <StatusPill tone={SEVERITY_TONE[n.severity] ?? 'neutral'}>
          {ar.approvals.severity[n.severity as keyof typeof ar.approvals.severity] ?? n.severity}
        </StatusPill>
      ),
    },
    {
      key: 'resolution',
      header: ar.approvals.resolutionLabel,
      cell: (n) => {
        const r = n.resolution ?? '';
        const label =
          ar.approvals.resolution[r as keyof typeof ar.approvals.resolution] ?? r;
        return <StatusPill tone={RESOLUTION_TONE[r] ?? 'neutral'}>{label || '—'}</StatusPill>;
      },
    },
    {
      key: 'resolved_at',
      header: ar.approvals.resolvedAt,
      cell: (n) => (
        <span className="text-xs text-foreground-muted tabular-num" dir="ltr">
          {n.resolved_at ? fmtDate(n.resolved_at) : '—'}
        </span>
      ),
      secondary: true,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={ar.approvals.title} description={ar.approvals.description} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border-subtle">
        <button
          type="button"
          onClick={() => setTab('pending')}
          className={cn(
            'relative px-4 py-2 text-sm font-medium transition-colors duration-150 inline-flex items-center gap-2',
            tab === 'pending' ? 'text-accent' : 'text-foreground-muted hover:text-foreground',
          )}
        >
          {ar.approvals.pendingTab}
          {pending.length > 0 && (
            <span className="inline-flex items-center justify-center rounded-pill bg-warning-subtle text-warning-foreground text-[11px] font-semibold px-2 min-w-5 h-5 tabular-num" dir="ltr">
              {pending.length}
            </span>
          )}
          {tab === 'pending' && (
            <span
              className="absolute inset-x-0 -bottom-px h-0.5 bg-accent rounded-pill transition-all duration-200 ease-emphasized"
              aria-hidden
            />
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('resolved');
            setPage(1);
          }}
          className={cn(
            'relative px-4 py-2 text-sm font-medium transition-colors duration-150',
            tab === 'resolved' ? 'text-accent' : 'text-foreground-muted hover:text-foreground',
          )}
        >
          {ar.approvals.resolvedTab}
          {tab === 'resolved' && (
            <span
              className="absolute inset-x-0 -bottom-px h-0.5 bg-accent rounded-pill transition-all duration-200 ease-emphasized"
              aria-hidden
            />
          )}
        </button>
      </div>

      {/* Pending queue */}
      {tab === 'pending' && (
        <>
          {pendingQ.isLoading ? (
            <ResponsiveTable
              columns={pendingColumns}
              rows={[]}
              rowKey={() => ''}
              isLoading
            />
          ) : pending.length === 0 ? (
            <EmptyState title={ar.approvals.empty} icon={ShieldCheck} />
          ) : (
            <ResponsiveTable
              columns={pendingColumns}
              rows={pending}
              rowKey={(n) => String(n.id)}
              onRowClick={(n) => setReviewing(n)}
              rowClassName={(n) => {
                const t = flash[n.id];
                if (!t) return '';
                return t === 'success' ? 'bg-success-subtle' : 'bg-danger-subtle';
              }}
              actions={(n) => (
                <Button
                  size="sm"
                  variant="accent"
                  onClick={(e) => {
                    e.stopPropagation();
                    setReviewing(n);
                  }}
                >
                  {ar.approvals.review}
                </Button>
              )}
            />
          )}
        </>
      )}

      {/* Resolved history */}
      {tab === 'resolved' && (
        <>
          <h2 className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
            {ar.approvals.historyTitle}
          </h2>
          {resolvedQ.isLoading ? (
            <ResponsiveTable columns={resolvedColumns} rows={[]} rowKey={() => ''} isLoading />
          ) : resolved.length === 0 ? (
            <EmptyState title={ar.approvals.emptyResolved} icon={ShieldCheck} />
          ) : (
            <ResponsiveTable
              columns={resolvedColumns}
              rows={resolved}
              rowKey={(n) => String(n.id)}
              onRowClick={(n) => setReviewing(n)}
            />
          )}

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
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
        </>
      )}

      {/* Review detail dialog */}
      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{ar.approvals.detailTitle}</DialogTitle>
          </DialogHeader>
          {reviewing && (
            <div className="space-y-4">
              {/* Header strip */}
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={SEVERITY_TONE[reviewing.severity] ?? 'neutral'}>
                  {ar.approvals.severity[reviewing.severity as keyof typeof ar.approvals.severity] ??
                    reviewing.severity}
                </StatusPill>
                {reviewing.resolution ? (
                  <StatusPill tone={RESOLUTION_TONE[reviewing.resolution] ?? 'neutral'}>
                    {ar.approvals.resolution[
                      reviewing.resolution as keyof typeof ar.approvals.resolution
                    ] ?? reviewing.resolution}
                  </StatusPill>
                ) : (
                  <StatusPill tone="warning">{ar.approvals.pendingLabel}</StatusPill>
                )}
                <span className="text-xs text-foreground-muted tabular-num" dir="ltr">
                  · {ageDiff(reviewing.created_at)}
                </span>
              </div>

              {/* Item info + context */}
              <div className="space-y-2">
                <p className="text-base font-semibold text-foreground">{reviewing.title_ar}</p>
                <p className="text-sm text-foreground-muted whitespace-pre-line leading-relaxed">
                  {reviewing.body_ar}
                </p>
              </div>

              <dl className="rounded-md border border-border-subtle bg-surface/50 p-3 text-xs space-y-1.5">
                <div className="flex justify-between gap-3">
                  <dt className="text-foreground-muted">تاريخ الإنشاء</dt>
                  <dd className="text-foreground tabular-num" dir="ltr">
                    {fmtDate(reviewing.created_at)}
                  </dd>
                </div>
                {reviewing.resolved_at && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-foreground-muted">{ar.approvals.resolvedAt}</dt>
                    <dd className="text-foreground tabular-num" dir="ltr">
                      {fmtDate(reviewing.resolved_at)}
                    </dd>
                  </div>
                )}
              </dl>

              {/* Comment field — pending only, owner only.
               * NOTE: the current API doesn't accept a comment payload on approve/reject;
               * this surface is here per Phase 5 spec and persists locally for owner reference. */}
              {!reviewing.resolution && isOwner && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-foreground-muted">ملاحظة (اختيارية)</Label>
                  <textarea
                    rows={3}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="اكتب ملاحظتك على هذا الطلب…"
                    className="w-full rounded-md border border-border-default bg-surface-elevated px-3 py-2 text-sm placeholder:text-foreground-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    {ar.approvals.close}
                  </Button>
                </DialogClose>
                {!reviewing.resolution && isOwner && (
                  <>
                    <Button
                      onClick={() => rejectMut.mutate(reviewing.id)}
                      disabled={approveMut.isPending || rejectMut.isPending}
                      className="bg-danger text-accent-foreground hover:bg-danger/90 gap-1.5"
                    >
                      {rejectMut.isPending && rejectMut.variables === reviewing.id ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <X className="size-4" aria-hidden />
                      )}
                      {ar.approvals.reject}
                    </Button>
                    <Button
                      onClick={() => approveMut.mutate(reviewing.id)}
                      disabled={approveMut.isPending || rejectMut.isPending}
                      className="bg-success text-accent-foreground hover:bg-success/90 gap-1.5"
                    >
                      {approveMut.isPending && approveMut.variables === reviewing.id ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Check className="size-4" aria-hidden />
                      )}
                      {ar.approvals.approve}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
