import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  title: string;
  description?: string;
  /** Trailing-edge slot for primary action button(s). */
  actions?: ReactNode;
  className?: string;
  /** Parent route — when provided a "رجوع" breadcrumb link appears above the title. */
  backTo?: string;
};

export function PageHeader({ title, description, actions, className, backTo }: Props) {
  return (
    <header
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        {backTo && (
          <Link
            to={backTo}
            className="inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground transition-colors duration-150 mb-1"
          >
            <ChevronRight className="size-4" />
            <span>رجوع</span>
          </Link>
        )}
        <h1 className="text-3xl font-semibold text-foreground truncate">{title}</h1>
        {description && (
          <p className="text-sm text-foreground-muted mt-1">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </header>
  );
}
