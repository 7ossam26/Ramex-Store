import { cn } from '@/lib/utils';

export type Period = '7d' | '30d' | '90d';

const LABELS: Record<Period, string> = {
  '7d': '٧ أيام',
  '30d': '٣٠ يوم',
  '90d': '٩٠ يوم',
};

const OPTIONS: Period[] = ['7d', '30d', '90d'];

export function PeriodChip({
  value,
  onChange,
}: {
  value: Period;
  onChange: (next: Period) => void;
}) {
  return (
    <div
      role="tablist"
      className="inline-flex rounded-pill border border-border-subtle bg-surface p-0.5"
    >
      {OPTIONS.map((p) => {
        const active = p === value;
        return (
          <button
            key={p}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(p)}
            className={cn(
              'px-3 py-1 text-xs font-medium rounded-pill transition-colors duration-150',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-foreground-muted hover:text-foreground',
            )}
          >
            {LABELS[p]}
          </button>
        );
      })}
    </div>
  );
}
