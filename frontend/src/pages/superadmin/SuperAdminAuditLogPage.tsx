import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { superadminApi, type AuditLogEntry } from '@/lib/superadmin-api';
import { cn } from '@/lib/utils';

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-amber-50 text-amber-700 border border-amber-200',
  high: 'bg-orange-50 text-orange-700 border border-orange-200',
  critical: 'bg-red-50 text-red-700 border border-red-200',
};

const SEVERITY_LABELS: Record<string, string> = {
  low: 'منخفض',
  medium: 'متوسط',
  high: 'عالي',
  critical: 'حرج',
};

function DiffViewer({ before, after }: { before: string | null; after: string | null }) {
  const parsedBefore = before ? (() => { try { return JSON.parse(before); } catch { return before; } })() : null;
  const parsedAfter = after ? (() => { try { return JSON.parse(after); } catch { return after; } })() : null;

  if (!parsedBefore && !parsedAfter) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
      {parsedBefore !== null && (
        <div>
          <p className="text-xs font-medium text-foreground-muted mb-1">قبل</p>
          <pre className="rounded-md bg-red-50 border border-red-100 p-3 text-xs text-foreground overflow-auto max-h-48 whitespace-pre-wrap break-words">
            {typeof parsedBefore === 'string' ? parsedBefore : JSON.stringify(parsedBefore, null, 2)}
          </pre>
        </div>
      )}
      {parsedAfter !== null && (
        <div>
          <p className="text-xs font-medium text-foreground-muted mb-1">بعد</p>
          <pre className="rounded-md bg-green-50 border border-green-100 p-3 text-xs text-foreground overflow-auto max-h-48 whitespace-pre-wrap break-words">
            {typeof parsedAfter === 'string' ? parsedAfter : JSON.stringify(parsedAfter, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDiff = entry.before_json || entry.after_json;

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <div
        className={cn(
          'flex items-start gap-3 px-4 py-3',
          hasDiff && 'cursor-pointer hover:bg-surface-hover transition-colors',
        )}
        onClick={() => hasDiff && setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-foreground">{entry.action}</span>
            <span className="text-xs text-foreground-muted">→ {entry.entity}</span>
            {entry.entity_id && (
              <span className="text-xs text-foreground-tertiary">#{entry.entity_id}</span>
            )}
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full', SEVERITY_COLORS[entry.severity] ?? SEVERITY_COLORS.low)}>
              {SEVERITY_LABELS[entry.severity] ?? entry.severity}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <span className="text-xs text-foreground-muted">
              {entry.username ? `@${entry.username}` : 'النظام'}
            </span>
            <span className="text-xs text-foreground-tertiary">
              {new Date(entry.created_at).toLocaleString('ar-EG')}
            </span>
            {entry.ip && <span className="text-xs text-foreground-tertiary font-mono">{entry.ip}</span>}
          </div>
        </div>
        {hasDiff && (
          <button type="button" className="shrink-0 text-foreground-muted p-1">
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        )}
      </div>
      {expanded && hasDiff && (
        <div className="px-4 pb-4">
          <DiffViewer before={entry.before_json} after={entry.after_json} />
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 50;

export function SuperAdminAuditLogPage() {
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState('');
  const [entity, setEntity] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['superadmin-audit-log', page, severity, entity, dateFrom, dateTo],
    queryFn: () => superadminApi.getAuditLog({ page, pageSize: PAGE_SIZE, severity: severity || undefined, entity: entity || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
    staleTime: 30_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">سجل المراجعة</h1>
        <p className="text-sm text-foreground-muted">جميع العمليات الحساسة مع تفاصيل كاملة</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-foreground-muted">الجسم</label>
          <input
            value={entity}
            onChange={(e) => { setEntity(e.target.value); setPage(1); }}
            placeholder="users, auth, …"
            dir="ltr"
            className="h-8 rounded-md border border-border-default bg-surface-elevated px-2.5 text-xs w-32 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-foreground-muted">الخطورة</label>
          <select
            value={severity}
            onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
            className="h-8 rounded-md border border-border-default bg-surface-elevated px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <option value="">الكل</option>
            <option value="low">منخفض</option>
            <option value="medium">متوسط</option>
            <option value="high">عالي</option>
            <option value="critical">حرج</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-foreground-muted">من</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="h-8 rounded-md border border-border-default bg-surface-elevated px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-foreground-muted">إلى</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="h-8 rounded-md border border-border-default bg-surface-elevated px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          />
        </div>
        {(severity || entity || dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => { setSeverity(''); setEntity(''); setDateFrom(''); setDateTo(''); setPage(1); }}
            className="h-8 px-3 rounded-md border border-border-subtle text-xs text-foreground-muted hover:text-foreground hover:border-foreground-muted/40 transition-colors self-end"
          >
            مسح الفلاتر
          </button>
        )}
      </div>

      {/* Log table */}
      <div className="rounded-xl border border-border-subtle bg-surface-elevated overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="py-12 text-center text-foreground-tertiary text-sm">جاري التحميل…</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-foreground-tertiary text-sm">لا توجد سجلات</div>
        ) : (
          rows.map((entry) => <AuditRow key={entry.id} entry={entry} />)
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-foreground-muted">{total} سجل إجمالي</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 rounded-md border border-border-subtle text-xs disabled:opacity-40 hover:bg-surface-hover transition-colors"
            >
              السابق
            </button>
            <span className="text-xs text-foreground-muted">{page} / {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-md border border-border-subtle text-xs disabled:opacity-40 hover:bg-surface-hover transition-colors"
            >
              التالي
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
