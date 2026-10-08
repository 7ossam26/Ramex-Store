import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBackNavigation } from '@/lib/navigation-history';

type Props = {
  /** Parent route used when there is no in-app previous page (direct URL entry, new tab). */
  fallback: string;
  className?: string;
  children?: ReactNode;
};

/**
 * "رجوع" link that returns to the actual previous in-app page (browser history),
 * falling back to `fallback`. The href points at the real target so
 * Ctrl/middle-click still opens it in a new tab.
 */
export function BackLink({ fallback, className, children }: Props) {
  const { previousPath, goBack } = useBackNavigation(fallback);

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    goBack();
  }

  return (
    <Link
      to={previousPath ?? fallback}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground transition-colors duration-150',
        className,
      )}
    >
      <ChevronRight className="size-4" aria-hidden />
      <span>{children ?? 'رجوع'}</span>
    </Link>
  );
}
