import { Link } from 'react-router-dom';
import { Bell, ChevronLeft } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { cn } from '@/lib/utils';
import { WidgetCard } from './states';
import { QuietEmpty } from './QuietEmpty';
import type { NotificationRow } from '@/lib/notifications-api';

/* Compact list of the 5 most recent notifications. */
export function NotificationsPeek({
  rows,
  emptyCaption,
}: {
  rows: NotificationRow[];
  emptyCaption?: string;
}) {
  return (
    <WidgetCard
      title={ar.dashboard.pulse.notifications}
      action={
        <Link
          to="/notifications"
          className="text-xs text-foreground-muted hover:text-accent inline-flex items-center gap-1"
        >
          {ar.dashboard.seller.viewAll}
          <ChevronLeft className="size-3.5" aria-hidden />
        </Link>
      }
    >
      {rows.length === 0 ? (
        <QuietEmpty
          variant="list"
          caption={emptyCaption ?? ar.dashboard.pulse.notificationsHint}
        />
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 5).map((n) => (
            <li
              key={n.id}
              className="flex items-start gap-3 py-1"
            >
              <span
                className={cn(
                  'size-2 rounded-full shrink-0 mt-1.5',
                  n.severity === 'critical' && 'bg-danger',
                  n.severity === 'high' && 'bg-warning',
                  n.severity === 'medium' && 'bg-info',
                  n.severity === 'low' && 'bg-border-strong',
                )}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{n.title_ar}</p>
                <p className="text-xs text-foreground-tertiary truncate mt-0.5">
                  {n.body_ar}
                </p>
              </div>
              {n.read_at == null && (
                <Bell className="size-3.5 text-accent shrink-0 mt-1" aria-hidden />
              )}
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
