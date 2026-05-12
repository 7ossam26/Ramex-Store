import { cn } from '@/lib/utils';

type Props = {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
  disabled?: boolean;
  className?: string;
};

/* Pill toggle used by الفواتير filter row.
 * Active = filled accent, inactive = outlined surface. 75ms color tween. */
export function FilterChip({ active, onClick, children, count, disabled, className }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-sm font-medium whitespace-nowrap min-h-[36px]',
        'transition-colors duration-75 ease-standard',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        active
          ? 'bg-accent text-accent-foreground border border-accent hover:bg-accent-hover hover:border-accent-hover'
          : 'bg-surface-elevated text-foreground border border-border-default hover:bg-surface-hover hover:border-border-strong',
        className,
      )}
    >
      <span>{children}</span>
      {count != null && (
        <span
          className={cn(
            'inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-pill text-[11px] font-semibold tabular-num',
            active
              ? 'bg-accent-foreground/20 text-accent-foreground'
              : 'bg-surface-hover text-foreground-muted',
          )}
          dir="ltr"
        >
          {count}
        </span>
      )}
    </button>
  );
}
