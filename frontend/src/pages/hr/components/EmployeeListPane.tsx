import { Users } from 'lucide-react';
import { ar } from '@/i18n/ar';
import type { HrEmployee } from '@/lib/hr-api';
import { Skeleton } from '@/components/Skeleton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { cn } from '@/lib/utils';
import { fmt } from './utils';

export function EmployeeListPane({
  employees,
  total,
  isLoading,
  isError,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  totals,
}: {
  employees: HrEmployee[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  search: string;
  onSearchChange: (v: string) => void;
  totals: Map<number, number>;
}) {
  return (
    <aside className="h-full rounded-xl border border-border-subtle bg-surface-elevated shadow-sm flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border-subtle shrink-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-accent">
          <Users size={18} />
          <span>{ar.hr.employee.count}</span>
          <span className="text-foreground-muted tabular-num">({total})</span>
        </h2>
      </header>

      {/* Search */}
      <div className="p-3 border-b border-border-subtle shrink-0">
        <input
          className="h-9 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground placeholder:text-foreground-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          dir="rtl"
          placeholder={ar.hr.employee.searchByName}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading && (
          <div className="p-3 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        )}
        {isError && (
          <div className="p-3">
            <ErrorBanner title={ar.common.error} description={ar.common.error} />
          </div>
        )}
        {!isLoading && !isError && employees.length === 0 && (
          <p className="p-6 text-sm text-foreground-muted text-center">{ar.hr.employee.empty}</p>
        )}
        {!isLoading && !isError && employees.map((e) => {
          const selected = e.id === selectedId;
          const total = totals.get(e.id) ?? 0;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelect(e.id)}
              className={cn(
                'relative w-full text-start flex items-center justify-between gap-3 px-4 py-3 border-b border-border-subtle transition-colors cursor-pointer',
                selected ? 'bg-surface-active' : 'hover:bg-surface-hover',
              )}
            >
              {selected && <span className="absolute inset-y-0 start-0 w-0.5 bg-accent" aria-hidden />}
              <div className="min-w-0">
                <div className={cn('font-medium truncate', selected ? 'text-accent' : 'text-foreground')}>
                  {e.name_ar}
                </div>
                <div className="text-xs text-foreground-muted truncate">{e.role_ar ?? '—'}</div>
              </div>
              <div className="tabular-num text-sm text-foreground shrink-0" dir="ltr">
                {fmt(total)}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
