import { cn } from '@/lib/utils';

export type BadgeTone = 'accent' | 'danger' | 'success' | 'info' | 'warning' | 'neutral';

/* Numeric or compact label badge. Distinct from StatusPill:
 *   StatusPill = subtle background, semantic status (paid / awaiting / cancelled).
 *   Badge     = solid color, primarily a notification or count indicator.
 * Use StatusPill for status; Badge for counts / overlays / inline tags. */
const toneClasses: Record<BadgeTone, string> = {
  accent: 'bg-accent text-foreground-on-accent',
  danger: 'bg-danger text-foreground-on-accent',
  success: 'bg-success text-foreground-on-accent',
  info: 'bg-info text-foreground-on-accent',
  warning: 'bg-warning text-foreground-on-accent',
  neutral: 'bg-foreground-tertiary text-foreground-on-accent',
};

type Props = {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
};

export function Badge({ tone = 'accent', children, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-pill px-2 py-0.5 text-xs font-semibold leading-none min-w-5 h-5',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
