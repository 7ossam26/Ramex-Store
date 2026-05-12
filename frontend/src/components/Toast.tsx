import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastTone = 'success' | 'danger' | 'warning' | 'info';

type Props = {
  open: boolean;
  message: string;
  tone?: ToastTone;
  /** ms before auto-dismiss. Set 0 to disable. Default 3000. */
  autoDismissMs?: number;
  /** Show animated progress bar that drains over autoDismissMs. Default false. */
  showProgress?: boolean;
  /** Render the X dismiss button. Default false (success uses auto-dismiss only). */
  dismissible?: boolean;
  /** Called when the toast should close (auto-dismiss or X click). */
  onClose: () => void;
  /** Bottom offset when POS owns the chrome (mobile keyboard, etc.). Default 'bottom-6'. */
  className?: string;
};

const toneIcon: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  danger: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
};

const toneSurface: Record<ToastTone, string> = {
  success: 'border-success/40 bg-surface-elevated text-foreground',
  danger: 'border-danger/40 bg-danger-subtle text-danger-foreground',
  warning: 'border-warning/40 bg-warning-subtle text-warning-foreground',
  info: 'border-info/40 bg-info-subtle text-info-foreground',
};

const toneIconColor: Record<ToastTone, string> = {
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
};

const toneProgress: Record<ToastTone, string> = {
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
};

const toneProgressTrack: Record<ToastTone, string> = {
  success: 'bg-success/15',
  danger: 'bg-danger/15',
  warning: 'bg-warning/15',
  info: 'bg-info/15',
};

export function Toast({
  open,
  message,
  tone = 'info',
  autoDismissMs = 3000,
  showProgress = false,
  dismissible = false,
  onClose,
  className,
}: Props) {
  const Icon = toneIcon[tone];

  useEffect(() => {
    if (!open || autoDismissMs <= 0) return;
    const t = setTimeout(onClose, autoDismissMs);
    return () => clearTimeout(t);
  }, [open, autoDismissMs, onClose]);

  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-6 z-toast flex justify-center pointer-events-none px-4',
        className,
      )}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            data-functional-motion
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
            role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
            aria-live={tone === 'danger' ? 'assertive' : 'polite'}
            className={cn(
              'pointer-events-auto rounded-lg border shadow-lg overflow-hidden w-[min(92vw,420px)]',
              toneSurface[tone],
            )}
          >
            <div className="flex items-start gap-2 p-3">
              <Icon className={cn('size-5 shrink-0 mt-0.5', toneIconColor[tone])} aria-hidden />
              <p className="text-sm font-medium flex-1">{message}</p>
              {dismissible && (
                <button
                  onClick={onClose}
                  className="opacity-70 hover:opacity-100 cursor-pointer p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded"
                  aria-label="إغلاق"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            {showProgress && autoDismissMs > 0 && (
              <div className={cn('h-1', toneProgressTrack[tone])}>
                <div
                  data-functional-motion
                  className={cn('h-full', toneProgress[tone])}
                  style={{
                    transformOrigin: 'right',
                    animation: `rmx-toast-progress ${autoDismissMs}ms linear 1 forwards`,
                  }}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
