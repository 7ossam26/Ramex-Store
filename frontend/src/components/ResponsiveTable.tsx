import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

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
  /** Replaces both the empty mobile card and empty table body. */
  empty?: ReactNode;
  /** Wraps every desktop row; useful for status-stripe borders etc. */
  rowClassName?: (row: T) => string;
  className?: string;
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
}: Props<T>) {
  const visibleCols = columns;
  return (
    <>
      {/* Desktop: real <table> */}
      <div className={cn('hidden md:block overflow-x-auto', className)}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-xs text-muted-foreground border-b border-border">
              {visibleCols.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'px-3 py-2 font-medium',
                    c.align === 'end' && 'text-left',
                    c.className,
                  )}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </th>
              ))}
              {actions && <th className="px-3 py-2 w-px" aria-label="actions" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleCols.length + (actions ? 1 : 0)}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {empty ?? '—'}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-border last:border-0 hover:bg-muted/40 transition-colors',
                    onRowClick && 'cursor-pointer',
                    rowClassName?.(row),
                  )}
                >
                  {visibleCols.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-3 py-2 align-middle',
                        c.align === 'end' && 'text-left',
                        c.className,
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                  {actions && (
                    <td
                      className="px-3 py-2 align-middle text-left whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {actions(row)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <div className={cn('md:hidden flex flex-col gap-2', className)}>
        {rows.length === 0 ? (
          <div className="rounded border border-border bg-canvas p-6 text-center text-sm text-muted-foreground">
            {empty ?? '—'}
          </div>
        ) : (
          rows.map((row) => {
            const primaryCols = visibleCols.filter((c) => c.primary);
            const secondaryCols = visibleCols.filter((c) => c.secondary);
            const restCols = visibleCols.filter(
              (c) => !c.primary && !c.secondary && !c.hideOnMobile,
            );
            return (
              <div
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'rounded border border-border bg-canvas p-3 flex flex-col gap-1.5',
                  onRowClick && 'cursor-pointer active:bg-muted/40',
                  rowClassName?.(row),
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {primaryCols.map((c) => (
                      <div key={c.key} className="text-base font-medium truncate">
                        {c.cell(row)}
                      </div>
                    ))}
                    {secondaryCols.length > 0 && (
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
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
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs pt-1.5 border-t border-border/60">
                    {restCols.map((c) => (
                      <div key={c.key} className="flex flex-col">
                        <dt className="text-muted-foreground">{c.header}</dt>
                        <dd className={cn('font-medium', c.className)}>{c.cell(row)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
