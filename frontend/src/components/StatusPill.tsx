import { cn } from '@/lib/utils';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/* Semantic tone → token surface + text per Re-Skin Standard:
 *   info-subtle    → awaiting / in-progress
 *   success-subtle → completed / paid
 *   warning-subtle → action-needed / stale
 *   danger-subtle  → cancelled / failed / theft
 *   neutral        → muted surface for unscoped states */
const toneClasses: Record<StatusTone, string> = {
  success: 'bg-success-subtle text-success-foreground',
  warning: 'bg-warning-subtle text-warning-foreground',
  danger: 'bg-danger-subtle text-danger-foreground',
  info: 'bg-info-subtle text-info-foreground',
  neutral: 'bg-surface-hover text-foreground-muted',
};

type Props = {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
};

export function StatusPill({ tone, children, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
