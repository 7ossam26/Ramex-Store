import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* Calm empty placeholder used INSIDE a WidgetCard when there's no data.
 * Three variants by widget kind. Never says "no data". Always renders shape. */
export function QuietEmpty({
  caption,
  variant = 'stat',
  icon,
  className,
}: {
  caption: string;
  variant?: 'stat' | 'list' | 'chart';
  icon?: ReactNode;
  className?: string;
}) {
  if (variant === 'list') {
    return (
      <div className={cn('space-y-2', className)} aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 py-1.5 opacity-40"
          >
            <div className="size-2 rounded-full bg-border-strong" />
            <div className="h-2 flex-1 rounded bg-border-subtle" />
            <div className="h-2 w-12 rounded bg-border-subtle" />
          </div>
        ))}
        <p className="text-xs text-foreground-tertiary pt-2 text-center">
          {caption}
        </p>
      </div>
    );
  }

  if (variant === 'chart') {
    return (
      <div className={cn('flex flex-col items-stretch', className)} aria-hidden>
        <div className="relative h-32 flex items-end gap-1 opacity-30">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 bg-border-subtle rounded-t-sm"
              style={{ height: '8%' }}
            />
          ))}
          <div className="absolute inset-x-0 bottom-0 h-px bg-border-default" />
        </div>
        <p className="text-xs text-foreground-tertiary pt-3 text-center">
          {caption}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold text-foreground-tertiary tabular-num" dir="ltr">
          —
        </span>
      </div>
      <p className="text-xs text-foreground-tertiary flex items-center gap-1.5">
        {icon}
        {caption}
      </p>
    </div>
  );
}
