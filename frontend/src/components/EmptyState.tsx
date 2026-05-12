import type { ReactNode } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Trailing call-to-action (button, link). */
  action?: ReactNode;
  className?: string;
  /** Render inside an enclosed card, default true. Set false for embedded use (e.g. inside table). */
  bordered?: boolean;
};

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
  bordered = true,
}: Props) {
  return (
    <div
      className={cn(
        'p-12 text-center flex flex-col items-center gap-3',
        bordered && 'rounded-lg border border-border-subtle bg-surface-elevated',
        className,
      )}
    >
      <div
        className="size-16 rounded-full bg-surface-hover flex items-center justify-center"
        aria-hidden
      >
        <Icon className="size-8 text-foreground-tertiary" />
      </div>
      <div className="space-y-1">
        <p className="text-base text-foreground font-medium">{title}</p>
        {description && (
          <p className="text-sm text-foreground-muted max-w-sm">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
