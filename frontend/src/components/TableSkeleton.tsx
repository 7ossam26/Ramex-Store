import { cn } from '@/lib/utils';

type Props = {
  /** Number of placeholder rows. Default 8. */
  rows?: number;
  /** Number of column placeholders per row. Default 5. */
  columns?: number;
  className?: string;
};

export function TableSkeleton({ rows = 8, columns = 5, className }: Props) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border-subtle bg-surface-elevated overflow-hidden',
        className,
      )}
      aria-hidden
    >
      {/* Header strip */}
      <div className="px-3 py-3 border-b border-border-subtle bg-surface-hover/40 flex items-center gap-3">
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded bg-surface-hover animate-pulse"
            style={{ width: `${100 / columns}%` }}
          />
        ))}
      </div>
      {/* Rows */}
      <div className="divide-y divide-border-subtle">
        {Array.from({ length: rows }).map((_, ri) => (
          <div key={ri} className="px-3 py-3 flex items-center gap-3">
            {Array.from({ length: columns }).map((_, ci) => (
              <div
                key={ci}
                className="h-3 rounded bg-surface-hover animate-pulse"
                style={{ width: `${100 / columns}%`, animationDelay: `${(ri * columns + ci) * 30}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
