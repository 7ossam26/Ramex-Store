import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/* Base shimmer block. Use directly for one-offs (card/form placeholders),
 * compose into purpose-built skeletons (see TableSkeleton). The shimmer
 * is a single CSS animate-pulse on `bg-surface-hover` so the muted-motion
 * scope collapses it without ceremony. */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      style={style}
      className={cn('rounded bg-surface-hover animate-pulse', className)}
    />
  );
}

/* Card-shaped skeleton: title bar + a few text lines inside a bordered
 * surface. Used for metric cards, summary panels, list items pre-load. */
export function CardSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'rounded-lg border border-border-subtle bg-surface-elevated p-5 space-y-3',
        className,
      )}
    >
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3', i === lines - 1 ? 'w-3/5' : 'w-full')}
        />
      ))}
    </div>
  );
}
