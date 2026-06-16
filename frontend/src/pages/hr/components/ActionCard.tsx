import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A single action tile in the employee detail grid. */
export function ActionCard({
  label,
  icon: Icon,
  onClick,
  className,
}: {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-4 py-3.5 text-sm text-foreground transition-colors duration-150 hover:bg-surface-hover hover:border-border-default cursor-pointer',
        className,
      )}
    >
      <span className="font-medium">{label}</span>
      <Icon size={18} className="text-foreground-muted" />
    </button>
  );
}
