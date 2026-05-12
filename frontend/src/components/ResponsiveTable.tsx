import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TableSkeleton } from '@/components/TableSkeleton';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EmptyState } from '@/components/EmptyState';

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** On mobile: render as the big primary line of the card. */
  primary?: boolean;
  /** On mobile: render muted as secondary text below the primary line. */
  secondary?: boolean;
  /** Hide entirely on mobile. */
  hideOnMobile?: boolean;
  align?: 'start' | 'end';
  className?: string;
  /** Fixed width / min width on desktop. */
  width?: string;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Renders inside a 3-dot menu on mobile, and as a trailing cell on desktop. */
  actions?: (row: T) => ReactNode;
  /** Replaces both the empty mobile card and empty table body. Accepts a string or fully custom node. */
  empty?: ReactNode;
  /** Wraps every desktop row; useful for status-stripe borders etc. */
  rowClassName?: (row: T) => string;
  className?: string;
  /** When true, render skeleton placeholders instead of rows. */
  isLoading?: boolean;
  /** When set, render error banner instead of rows. */
  isError?: boolean;
  onRetry?: () => void;
  errorTitle?: string;
  errorDescription?: string;
  /** When this value changes, rows fade in fresh (150ms). Use for filter changes. */
  resetKey?: string | number;
};

export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  actions,
  empty,
  rowClassName,
  className,
  isLoading,
  isError,
  onRetry,
  errorTitle,
  errorDescription,
  resetKey,
}: Props<T>) {
  const visibleCols = columns;
  // Stagger only on the very first paint. Subsequent resetKey flips (filter
  // changes) re-key tbody so rows fade in, but without re-playing the cascade.
  const hasPaintedRef = useRef(false);
  const [mountTick, setMountTick] = useState(0);

  // After the first paint, flip the flag so subsequent resetKey-driven re-keys
  // fade in instantly instead of replaying the row stagger.
  useEffect(() => {
    hasPaintedRef.current = true;
  }, []);

  useEffect(() => {
    setMountTick((t) => t + 1);
  }, [resetKey]);

  const rowDelay = (i: number) =>
    hasPaintedRef.current ? 0 : Math.min(i, 9) * 0.03;

  if (isLoading) {
    return <TableSkeleton rows={8} columns={Math.min(visibleCols.length, 6)} className={className} />;
  }

  if (isError) {
    return (
      <ErrorBanner
        title={errorTitle ?? 'تعذر تحميل البيانات'}
        description={errorDescription ?? 'يرجى المحاولة مرة أخرى.'}
        onRetry={onRetry}
        className={className}
      />
    );
  }

  const renderEmpty = () =>
    typeof empty === 'string' || empty == null ? (
      <EmptyState title={(empty as string) ?? 'لا توجد عناصر بعد'} bordered={false} />
    ) : (
      empty
    );

  return (
    <>
      {/* Desktop: real <table> */}
      <div
        className={cn(
          'hidden md:block overflow-x-auto rounded-lg border border-border-subtle bg-surface-elevated shadow-sm',
          className,
        )}
      >
        <table className="w-full text-sm">
          {/* No sticky behavior: the page (not the table wrapper) owns the
              scroll context, so `position: sticky` here is inert. Dropped per
              Phase 7 closeout-fix review. */}
          <thead className="bg-surface-elevated">
            <tr className="text-start text-xs text-foreground-muted border-b border-border-subtle">
              {visibleCols.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'px-3 py-3 font-medium uppercase tracking-wide',
                    c.align === 'end' && 'text-end',
                    c.className,
                  )}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </th>
              ))}
              {actions && <th className="px-3 py-3 w-px" aria-label="actions" />}
            </tr>
          </thead>
          <tbody key={mountTick}>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleCols.length + (actions ? 1 : 0)}
                  className="px-3 py-0"
                >
                  {renderEmpty()}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <motion.tr
                  key={rowKey(row)}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.15,
                    ease: [0, 0, 0.2, 1],
                    delay: rowDelay(i),
                  }}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150',
                    onRowClick && 'cursor-pointer',
                    rowClassName?.(row),
                  )}
                >
                  {visibleCols.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-3 py-2.5 align-middle text-foreground',
                        c.align === 'end' && 'text-end',
                        c.className,
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                  {actions && (
                    <td
                      className="px-3 py-2.5 align-middle text-end whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {actions(row)}
                    </td>
                  )}
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <div className={cn('md:hidden flex flex-col gap-2', className)} key={`m-${mountTick}`}>
        {rows.length === 0 ? (
          renderEmpty()
        ) : (
          rows.map((row, i) => {
            const primaryCols = visibleCols.filter((c) => c.primary);
            const secondaryCols = visibleCols.filter((c) => c.secondary);
            const restCols = visibleCols.filter(
              (c) => !c.primary && !c.secondary && !c.hideOnMobile,
            );
            return (
              <motion.div
                key={rowKey(row)}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.15,
                  ease: [0, 0, 0.2, 1],
                  delay: rowDelay(i),
                }}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'rounded-lg border border-border-subtle bg-surface-elevated p-3 flex flex-col gap-1.5 shadow-sm transition-colors duration-150',
                  onRowClick && 'cursor-pointer active:bg-surface-hover',
                  rowClassName?.(row),
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {primaryCols.map((c) => (
                      <div key={c.key} className="text-base font-medium text-foreground truncate">
                        {c.cell(row)}
                      </div>
                    ))}
                    {secondaryCols.length > 0 && (
                      <div className="text-xs text-foreground-muted flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {secondaryCols.map((c) => (
                          <span key={c.key}>{c.cell(row)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {actions && (
                    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                      {actions(row)}
                    </div>
                  )}
                </div>
                {restCols.length > 0 && (
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs pt-1.5 border-t border-border-subtle">
                    {restCols.map((c) => (
                      <div key={c.key} className="flex flex-col">
                        <dt className="text-foreground-muted">{c.header}</dt>
                        <dd className={cn('font-medium text-foreground', c.className)}>{c.cell(row)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </motion.div>
            );
          })
        )}
      </div>
    </>
  );
}
