import { ar } from '@/i18n/ar';
import { WidgetCard } from './states';
import { QuietEmpty } from './QuietEmpty';
import type { AuditLogRow } from '@/lib/owner-api';

/* Compact audit-log feed.
 * SECURITY: only renders actor / action / entity / time. The `before` and
 * `after` payloads are intentionally NOT exposed here. */
export function ActivityFeed({ rows }: { rows: AuditLogRow[] }) {
  return (
    <WidgetCard title={ar.dashboard.movers.activityTitle}>
      {rows.length === 0 ? (
        <QuietEmpty variant="list" caption={ar.dashboard.movers.activityHint} />
      ) : (
        <ol className="space-y-2.5">
          {rows.slice(0, 10).map((r) => (
            <li key={r.id} className="flex items-start gap-3 text-xs">
              <time
                dateTime={r.created_at}
                dir="ltr"
                className="tabular-num text-foreground-tertiary shrink-0 w-12 mt-0.5"
              >
                {formatTimeHM(r.created_at)}
              </time>
              <span
                className="size-1.5 rounded-full bg-border-strong shrink-0 mt-1.5"
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <p className="text-foreground truncate">
                  <span className="font-medium">
                    {r.actor_name_ar ?? r.actor_username ?? '—'}
                  </span>
                  <span className="mx-1.5 text-foreground-tertiary">·</span>
                  <span className="text-foreground-muted">{r.action}</span>
                </p>
                <p className="text-foreground-tertiary truncate">
                  {r.entity}
                  {r.entity_id != null && (
                    <span dir="ltr" className="ms-1 tabular-num">
                      #{r.entity_id}
                    </span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </WidgetCard>
  );
}

function formatTimeHM(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return '';
  }
}
