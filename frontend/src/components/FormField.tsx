import { useId, type ReactElement, type ReactNode, cloneElement } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Props = {
  label: ReactNode;
  required?: boolean;
  helper?: ReactNode;
  error?: ReactNode;
  /** A single input/select element. id + aria-describedby/invalid get wired automatically. */
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
  className?: string;
};

/* Standard form field per Re-Skin Standard:
 * label above (text-sm font-medium), required asterisk in danger, helper below (text-tertiary),
 * inline error in text-danger text-sm with 75ms fade-in. */
export function FormField({ label, required, helper, error, children, className }: Props) {
  const inputId = useId();
  const helperId = useId();
  const errorId = useId();
  const describedBy = [helper ? helperId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  const child = cloneElement(children, {
    id: children.props.id ?? inputId,
    'aria-describedby': describedBy,
    'aria-invalid': !!error,
  });

  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={children.props.id ?? inputId} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-danger ms-1" aria-hidden>*</span>}
      </Label>
      {child}
      {helper && !error && (
        <p id={helperId} className="text-xs text-foreground-tertiary">{helper}</p>
      )}
      {error && (
        <p
          id={errorId}
          className="text-sm text-danger transition-opacity duration-75 ease-standard"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
