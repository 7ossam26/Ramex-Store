import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';

type PageShellProps = {
  title: string;
  description?: string;
  backTo?: string;
  actions?: ReactNode;
  /** Extra content rendered below the description in the page header. */
  extra?: ReactNode;
  /** Compact filter row card rendered between header and content. */
  filters?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Standard page wrapper for sidebar-accessible pages.
 *
 * Mirrors the Reports section idiom: max-width 6xl, centered, vertical
 * rhythm of space-y-6, optional filter card, children rendered as
 * report-style elevated cards.
 *
 * Use with `<SectionCard>` for content blocks.
 */
export function PageShell({
  title,
  description,
  backTo,
  actions,
  extra,
  filters,
  children,
  className,
}: PageShellProps) {
  return (
    <div className={cn('space-y-6 max-w-6xl mx-auto', className)}>
      <PageHeader
        title={title}
        description={description}
        backTo={backTo}
        actions={actions}
        extra={extra}
      />

      {filters && (
        <div className="rounded-lg border border-border-subtle bg-surface-elevated p-4 shadow-sm flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          {filters}
        </div>
      )}

      {children}
    </div>
  );
}

type SectionCardProps = {
  title?: string;
  /** Heading-level trailing slot (e.g. "View all" link, count badge). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Strip outer padding (useful when children are a table that already provides spacing). */
  noPadding?: boolean;
};

/**
 * Elevated content card used inside `<PageShell>`. The first card on a page
 * holds the primary content (usually a table); additional cards group related
 * sections (KPIs, side panels, etc.).
 */
export function SectionCard({
  title,
  action,
  children,
  className,
  noPadding,
}: SectionCardProps) {
  return (
    <section
      className={cn(
        'rounded-lg border border-border-subtle bg-surface-elevated shadow-sm overflow-hidden',
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border-subtle">
          {title && (
            <h2 className="text-sm font-medium text-foreground">{title}</h2>
          )}
          {action && <div className="text-sm">{action}</div>}
        </header>
      )}
      <div className={cn(!noPadding && 'p-4')}>{children}</div>
    </section>
  );
}
