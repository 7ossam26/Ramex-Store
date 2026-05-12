import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { notificationsApi, type NotificationRow } from '@/lib/notifications-api';
import { getEventTypeLabel, getSeverityLabel, eventTypeLabels, severityLabels } from '@/i18n/notifications';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';

type Tab = 'unread' | 'read' | 'archived';

const severityStripe: Record<string, string> = {
  low: 'border-s-4 border-border-default',
  medium: 'border-s-4 border-info',
  high: 'border-s-4 border-warning',
  critical: 'border-s-4 border-danger',
};

const severityBadge: Record<string, string> = {
  low: 'bg-surface-active text-foreground-muted',
  medium: 'bg-info-subtle text-info-foreground',
  high: 'bg-warning-subtle text-warning-foreground',
  critical: 'bg-danger-subtle text-danger-foreground',
};

function timeAgo(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ar });
  } catch {
    return '';
  }
}

const fmtDate = (s: string) =>
  new Date(s).toLocaleString('ar-EG-u-nu-latn', {
    timeZone: 'Africa/Cairo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function NotificationsPage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>('unread');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterEventType, setFilterEventType] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 30;

  const queryParams = {
    include_read: tab !== 'unread' ? true : undefined,
    include_archived: tab === 'archived' ? true : undefined,
    severity: filterSeverity || undefined,
    event_type: filterEventType || undefined,
    from: filterFrom || undefined,
    to: filterTo || undefined,
    page,
    limit: PAGE_SIZE,
  };

  // For the unread tab: only unread + unarchived
  // For the read tab: include_read=true but exclude archived
  // For archived: include_archived=true
  const finalParams = {
    ...queryParams,
    ...(tab === 'read' ? { include_read: true, include_archived: false } : {}),
    ...(tab === 'unread' ? { include_read: false, include_archived: false } : {}),
    ...(tab === 'archived' ? { include_read: true, include_archived: true } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'page', tab, filterSeverity, filterEventType, filterFrom, filterTo, page],
    queryFn: () => notificationsApi.list(finalParams).then((r) => r.data),
  });

  const markRead = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const resolve = useMutation({
    mutationFn: ({ id, resolution }: { id: number; resolution: 'approved' | 'rejected' | 'acknowledged' }) =>
      notificationsApi.resolve(id, resolution),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Filter archived tab to only show archived rows
  const displayRows = tab === 'archived'
    ? rows.filter((r) => r.archived_at)
    : tab === 'read'
      ? rows.filter((r) => r.read_at && !r.archived_at)
      : rows.filter((r) => !r.read_at && !r.archived_at);

  return (
    <div className="max-w-4xl mx-auto py-6 px-4" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">الإشعارات</h1>
        {tab === 'unread' && rows.some((r) => !r.read_at) && (
          <Button variant="outline" size="sm" onClick={() => markAll.mutate()}>
            تحديد الكل كمقروء
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-border overflow-x-auto whitespace-nowrap -mx-3 md:mx-0 px-3 md:px-0">
        {(['unread', 'read', 'archived'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`pb-2 px-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => { setTab(t); setPage(1); }}
          >
            {t === 'unread' ? 'غير مقروءة' : t === 'read' ? 'مقروءة' : 'محفوظة'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          className="border border-border rounded-md px-3 py-1.5 text-sm bg-canvas"
          value={filterSeverity}
          onChange={(e) => { setFilterSeverity(e.target.value); setPage(1); }}
        >
          <option value="">كل المستويات</option>
          {Object.entries(severityLabels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select
          className="border border-border rounded-md px-3 py-1.5 text-sm bg-canvas"
          value={filterEventType}
          onChange={(e) => { setFilterEventType(e.target.value); setPage(1); }}
        >
          <option value="">كل الأنواع</option>
          {Object.entries(eventTypeLabels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <input
          type="date"
          className="border border-border rounded-md px-3 py-1.5 text-sm bg-canvas"
          value={filterFrom}
          onChange={(e) => { setFilterFrom(e.target.value); setPage(1); }}
          placeholder="من"
        />
        <input
          type="date"
          className="border border-border rounded-md px-3 py-1.5 text-sm bg-canvas"
          value={filterTo}
          onChange={(e) => { setFilterTo(e.target.value); setPage(1); }}
          placeholder="إلى"
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
      ) : displayRows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">لا توجد إشعارات</div>
      ) : (
        <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          {displayRows.map((n) => (
            <NotificationRow
              key={n.id}
              n={n}
              isOwner={isOwner}
              onRead={(id) => markRead.mutate(id)}
              onResolve={(id, res) => resolve.mutate({ id, resolution: res })}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            السابق
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            التالي
          </Button>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  n,
  isOwner,
  onRead,
  onResolve,
}: {
  n: NotificationRow;
  isOwner: boolean;
  onRead: (id: number) => void;
  onResolve: (id: number, res: 'approved' | 'rejected') => void;
}) {
  const isTheft = n.tag === 'سرقة';
  const isUnread = !n.read_at;

  return (
    <div
      className={`p-4 ${isUnread ? 'bg-muted/20' : ''} ${severityStripe[n.severity] ?? ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {isTheft && (
              <span className="text-xs bg-danger-subtle text-danger-foreground font-bold px-2 py-0.5 rounded-pill">سرقة</span>
            )}
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${severityBadge[n.severity] ?? ''}`}>
              {getSeverityLabel(n.severity)}
            </span>
            <span className="text-xs text-muted-foreground">{getEventTypeLabel(n.event_type)}</span>
            {n.is_blocking && !n.resolved_at && (
              <span className="text-xs bg-warning-subtle text-warning-foreground px-2 py-0.5 rounded-pill">يستلزم موافقة</span>
            )}
            {n.resolved_at && (
              <span className={`text-xs px-2 py-0.5 rounded-pill ${n.resolution === 'approved' ? 'bg-success-subtle text-success-foreground' : 'bg-danger-subtle text-danger-foreground'}`}>
                {n.resolution === 'approved' ? 'تمت الموافقة' : n.resolution === 'rejected' ? 'مرفوض' : 'تم الإقرار'}
              </span>
            )}
          </div>

          <div className={`text-sm ${isUnread ? 'font-semibold' : ''} ${isTheft ? 'text-danger-foreground' : ''}`}>
            {n.title_ar}
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">{n.body_ar}</div>
          <div className="text-xs text-muted-foreground mt-1">
            {fmtDate(n.created_at)} &nbsp;·&nbsp; {timeAgo(n.created_at)}
          </div>
        </div>

        <div className="flex flex-col gap-2 flex-shrink-0">
          {isUnread && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onRead(n.id)}
            >
              تحديد كمقروء
            </button>
          )}
          {n.is_blocking && !n.resolved_at && isOwner && (
            <div className="flex gap-1">
              <button
                className="text-xs px-2 py-1 bg-success-subtle text-success-foreground rounded hover:bg-success/20 font-medium transition-colors"
                onClick={() => onResolve(n.id, 'approved')}
              >
                موافقة
              </button>
              <button
                className="text-xs px-2 py-1 bg-danger-subtle text-danger-foreground rounded hover:bg-danger/20 font-medium transition-colors"
                onClick={() => onResolve(n.id, 'rejected')}
              >
                رفض
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
