import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { approvalsApi } from '@/lib/approvals-api';
import type { NotificationRow } from '@/lib/notifications-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';

const SEVERITY_COLOR: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

function ageDiff(created: string) {
  const ms = Date.now() - new Date(created).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ساعة`;
  return `${Math.floor(hrs / 24)} يوم`;
}

function SeverityBadge({ severity }: { severity: string }) {
  const cls = SEVERITY_COLOR[severity] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {ar.approvals.severity[severity as keyof typeof ar.approvals.severity] ?? severity}
    </span>
  );
}

function PendingRow({ n, isOwner }: { n: NotificationRow; isOwner: boolean }) {
  const qc = useQueryClient();

  const approveMut = useMutation({
    mutationFn: () => approvalsApi.approve(n.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals-pending'] });
      qc.invalidateQueries({ queryKey: ['approvals-resolved'] });
    },
  });

  const rejectMut = useMutation({
    mutationFn: () => approvalsApi.reject(n.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals-pending'] });
      qc.invalidateQueries({ queryKey: ['approvals-resolved'] });
    },
  });

  const busy = approveMut.isPending || rejectMut.isPending;

  return (
    <Card className="border-r-4 border-r-orange-400">
      <CardContent className="pt-4 pb-3 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <SeverityBadge severity={n.severity} />
              <span className="text-xs text-muted-foreground">{ar.approvals.age}: {ageDiff(n.created_at)}</span>
            </div>
            <p className="font-medium text-sm">{n.title_ar}</p>
            <p className="text-sm text-muted-foreground">{n.body_ar}</p>
          </div>
          {isOwner && (
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                onClick={() => approveMut.mutate()}
                disabled={busy}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {ar.approvals.approve}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => rejectMut.mutate()}
                disabled={busy}
                className="border-red-400 text-red-600 hover:bg-red-50"
              >
                {ar.approvals.reject}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ResolvedRow({ n }: { n: NotificationRow }) {
  const resLabel = n.resolution ? (ar.approvals.resolution[n.resolution as keyof typeof ar.approvals.resolution] ?? n.resolution) : '—';
  const resColor = n.resolution === 'approved' ? 'text-green-600' : n.resolution === 'rejected' ? 'text-red-600' : 'text-muted-foreground';

  return (
    <Card className="opacity-80">
      <CardContent className="pt-3 pb-2 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <SeverityBadge severity={n.severity} />
          </div>
          <p className="font-medium text-sm">{n.title_ar}</p>
          <p className="text-xs text-muted-foreground">{n.body_ar}</p>
        </div>
        <div className="shrink-0 text-left text-xs space-y-0.5">
          <p className={`font-medium ${resColor}`}>{resLabel}</p>
          {n.resolved_at && (
            <p className="text-muted-foreground">
              {new Date(n.resolved_at).toLocaleDateString('ar-EG')}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ApprovalsPage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const [tab, setTab] = useState<'pending' | 'resolved'>('pending');
  const [page, setPage] = useState(1);

  const { data: pendingData, isLoading: loadingPending } = useQuery({
    queryKey: ['approvals-pending'],
    queryFn: approvalsApi.listPending,
    refetchInterval: 30_000,
  });

  const { data: resolvedData, isLoading: loadingResolved } = useQuery({
    queryKey: ['approvals-resolved', page],
    queryFn: () => approvalsApi.listResolved(page, 30),
    enabled: tab === 'resolved',
  });

  const pending = pendingData?.rows ?? [];
  const resolved = resolvedData?.rows ?? [];
  const resolvedTotal = resolvedData?.total ?? 0;

  return (
    <div dir="rtl" className="space-y-4">
      <h1 className="text-2xl font-bold text-ink">{ar.approvals.title}</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto whitespace-nowrap -mx-3 md:mx-0 px-3 md:px-0">
        <button
          type="button"
          onClick={() => setTab('pending')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'pending'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-ink'
          }`}
        >
          {ar.approvals.pendingTab}
          {pending.length > 0 && (
            <span className="mr-2 inline-flex items-center justify-center rounded-full bg-orange-500 text-white text-xs w-5 h-5">
              {pending.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => { setTab('resolved'); setPage(1); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'resolved'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-ink'
          }`}
        >
          {ar.approvals.resolvedTab}
        </button>
      </div>

      {/* Pending */}
      {tab === 'pending' && (
        <div className="space-y-3">
          {loadingPending && <p>{ar.loading}</p>}
          {!loadingPending && pending.length === 0 && (
            <p className="text-muted-foreground text-sm">{ar.approvals.empty}</p>
          )}
          {pending.map((n) => (
            <PendingRow key={n.id} n={n} isOwner={isOwner} />
          ))}
        </div>
      )}

      {/* Resolved */}
      {tab === 'resolved' && (
        <div className="space-y-3">
          {loadingResolved && <p>{ar.loading}</p>}
          {!loadingResolved && resolved.length === 0 && (
            <p className="text-muted-foreground text-sm">{ar.approvals.emptyResolved}</p>
          )}
          {resolved.map((n) => (
            <ResolvedRow key={n.id} n={n} />
          ))}
          {resolvedTotal > 30 && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</Button>
              <Button size="sm" variant="outline" disabled={page * 30 >= resolvedTotal} onClick={() => setPage(page + 1)}>التالي</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
