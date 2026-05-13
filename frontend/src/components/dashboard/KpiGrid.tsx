import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* Responsive 1 / 2 / 4 col grid for the Pulse KPI tiles.
 * Wraps in motion-friendly markup; children should be MetricCard or compatible. */
export function KpiGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4', className)}>
      {children}
    </div>
  );
}
