import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BackLink } from '@/components/BackLink';

type Props = {
  title: string;
  description?: string;
  /** Trailing-edge slot for primary action button(s). */
  actions?: ReactNode;
  /** Extra content rendered below the description (e.g. location badge). */
  extra?: ReactNode;
  className?: string;
  /** Parent route — when provided a "رجوع" link appears above the title. It returns to the
   *  previous in-app page; this route is the fallback when there is none (direct URL entry). */
  backTo?: string;
};

export function PageHeader({ title, description, actions, extra, className, backTo }: Props) {
  return (
    <header
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        {backTo && <BackLink fallback={backTo} className="mb-1" />}
        <h1 className="text-3xl font-semibold text-foreground truncate">{title}</h1>
        {description && (
          <p className="text-sm text-foreground-muted mt-1">{description}</p>
        )}
        {extra && <div className="mt-3">{extra}</div>}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </header>
  );
}
