import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/Skeleton';
import { cn } from '@/lib/utils';

/* Card-shaped skeleton for the dashboard. Persistent (no pulse) so refetches
 * don't flash skeletons over already-loaded widgets. */
export function DashboardCardSkeleton({
  className,
  lines = 2,
}: { className?: string; lines?: number }) {
  return (
    <div
      aria-hidden
      className={cn(
        'rounded-lg border border-border-subtle bg-surface-elevated shadow-sm p-5',
        className,
      )}
    >
      <Skeleton className="h-3 w-1/3 mb-3" />
      <Skeleton className="h-7 w-2/3 mb-2" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-3 w-full mt-1.5" />
      ))}
    </div>
  );
}

/* Inline error state — fits a single grid cell. */
export function WidgetError({
  title,
  onRetry,
  className,
}: {
  title?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border border-danger/30 bg-danger-subtle p-5',
        'flex flex-col sm:flex-row sm:items-center gap-3',
        className,
      )}
    >
      <div className="flex items-start gap-3 flex-1">
        <AlertTriangle className="size-5 text-danger shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-danger-foreground text-sm">
            {title ?? 'تعذر تحميل البيانات'}
          </p>
          <p className="text-xs text-danger-foreground/80 mt-0.5">
            يرجى المحاولة مرة أخرى.
          </p>
        </div>
      </div>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm" className="gap-1.5 shrink-0">
          <RefreshCw className="size-4" />
          إعادة المحاولة
        </Button>
      )}
    </div>
  );
}

/* Card frame used by every widget. Provides consistent chrome so loading,
 * empty, and loaded states share the same outer shell. */
export function WidgetCard({
  title,
  action,
  children,
  className,
  innerClassName,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-lg border border-border-subtle bg-surface-elevated shadow-sm',
        'hover:shadow-md transition-shadow duration-150',
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between px-5 pt-5 pb-3">
          {title && (
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          )}
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn('px-5 pb-5', !title && !action && 'pt-5', innerClassName)}>
        {children}
      </div>
    </section>
  );
}
