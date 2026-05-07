import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { notificationsApi, type NotificationRow } from '@/lib/notifications-api';
import { getEventTypeLabel } from '@/i18n/notifications';
import { useAuth } from '@/lib/auth';

const severityStripe: Record<string, string> = {
  low: 'border-r-4 border-gray-300',
  medium: 'border-r-4 border-blue-400',
  high: 'border-r-4 border-orange-400',
  critical: 'border-r-4 border-red-600',
};

function timeAgo(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ar });
  } catch {
    return '';
  }
}

function NotificationItem({
  n,
  onRead,
  onResolve,
  isOwner,
}: {
  n: NotificationRow;
  onRead: (id: number) => void;
  onResolve: (id: number, res: 'approved' | 'rejected') => void;
  isOwner: boolean;
}) {
  const isTheft = n.tag === 'سرقة';
  const isUnread = !n.read_at;

  return (
    <div
      className={`px-4 py-3 cursor-pointer hover:bg-muted/50 ${severityStripe[n.severity] ?? ''}`}
      onClick={() => { if (isUnread) onRead(n.id); }}
    >
      <div className={`flex items-start justify-between gap-2 ${isUnread ? 'font-bold' : 'font-normal'}`}>
        <div className="flex-1 min-w-0">
          <div className={`text-sm truncate ${isTheft ? 'text-red-600 font-bold' : ''}`}>
            {isTheft && <span className="ml-1 text-xs bg-red-100 text-red-700 px-1 py-0.5 rounded">سرقة</span>}
            {n.title_ar}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body_ar}</div>
          <div className="text-xs text-muted-foreground mt-1">{timeAgo(n.created_at)}</div>
        </div>
        {n.is_blocking && !n.resolved_at && isOwner && (
          <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
              onClick={() => onResolve(n.id, 'approved')}
            >
              موافقة
            </button>
            <button
              className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
              onClick={() => onResolve(n.id, 'rejected')}
            >
              رفض
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isOwner = user?.role === 'owner';

  const { data: countData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsApi.unreadCount().then((r) => r.data),
    refetchInterval: 60_000,
  });

  const { data: listData } = useQuery({
    queryKey: ['notifications', 'bell-list'],
    queryFn: () => notificationsApi.list({ limit: 20, include_read: false }).then((r) => r.data),
    enabled: open,
    refetchOnWindowFocus: false,
  });

  const markRead = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const resolve = useMutation({
    mutationFn: ({ id, resolution }: { id: number; resolution: 'approved' | 'rejected' }) =>
      notificationsApi.resolve(id, resolution),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const count = countData?.count ?? 0;
  const rows = listData?.rows ?? [];

  return (
    <div className="relative">
      <button
        className="relative p-2 rounded-md hover:bg-muted/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-label="الإشعارات"
      >
        <Bell className="size-5" />
        {count > 0 && (
          <span className="absolute top-0.5 right-0.5 size-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full mt-2 w-80 bg-canvas border border-border rounded-lg shadow-lg z-50 overflow-hidden"
            dir="rtl"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-semibold text-sm">الإشعارات</span>
              {count > 0 && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => markAll.mutate()}
                >
                  تحديد الكل كمقروء
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-border">
              {rows.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  لا توجد إشعارات غير مقروءة
                </div>
              ) : (
                rows.map((n) => (
                  <NotificationItem
                    key={n.id}
                    n={n}
                    isOwner={isOwner}
                    onRead={(id) => markRead.mutate(id)}
                    onResolve={(id, res) => resolve.mutate({ id, resolution: res })}
                  />
                ))
              )}
            </div>

            <div className="border-t border-border px-4 py-2">
              <button
                className="w-full text-sm text-center text-primary hover:underline"
                onClick={() => { setOpen(false); navigate('/notifications'); }}
              >
                عرض الكل
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
