import { cn } from '@/lib/utils';

type Props = {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
};

export function Toggle({ checked, onChange, disabled, label, id }: Props) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill',
        'transition-colors duration-150 ease-standard cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-elevated',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        checked ? 'bg-accent' : 'bg-border',
      )}
    >
      <span
        className={cn(
          'inline-block size-4 rounded-full bg-surface-elevated shadow-sm',
          'transition-transform duration-200 ease-emphasized',
          checked
            ? 'translate-x-6 rtl:-translate-x-6'
            : 'translate-x-1 rtl:-translate-x-1',
        )}
      />
      {label && <span className="sr-only">{label}</span>}
    </button>
  );
}
