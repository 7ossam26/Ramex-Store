import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

/* Generic delayed tooltip on a light surface. For the dark-chrome rail
 * tooltip see AppShell/Rail.tsx — it has surface-specific styling and
 * stays purpose-built there. Use this Tooltip everywhere else (icon
 * buttons, truncated text, condensed UI). */

type Placement = 'top' | 'bottom' | 'start' | 'end';

const placementClasses: Record<Placement, string> = {
  top: 'bottom-full mb-2 start-1/2 -translate-x-1/2 rtl:translate-x-1/2',
  bottom: 'top-full mt-2 start-1/2 -translate-x-1/2 rtl:translate-x-1/2',
  start: 'end-full me-2 top-1/2 -translate-y-1/2',
  end: 'start-full ms-2 top-1/2 -translate-y-1/2',
};

const placementMotion: Record<Placement, { initial: { x?: number; y?: number } }> = {
  top: { initial: { y: -4 } },
  bottom: { initial: { y: 4 } },
  start: { initial: { x: 4 } },
  end: { initial: { x: -4 } },
};

type Props = {
  label: string;
  /** ms before tooltip appears on hover/focus. Default 400. */
  delayMs?: number;
  placement?: Placement;
  /** Disable rendering of the tooltip (e.g. on touch devices, when label is empty). */
  disabled?: boolean;
  children: ReactNode;
  className?: string;
};

export function Tooltip({
  label,
  delayMs = 400,
  placement = 'top',
  disabled = false,
  children,
  className,
}: Props) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | null>(null);

  const show = () => {
    if (disabled || !label) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(true), delayMs);
  };

  const hide = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setVisible(false);
  };

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  if (disabled || !label) return <>{children}</>;

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      <AnimatePresence>
        {visible && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, ...placementMotion[placement].initial }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, ...placementMotion[placement].initial }}
            transition={{ duration: 0.15, ease: [0, 0, 0.2, 1] }}
            className={cn(
              'pointer-events-none absolute whitespace-nowrap rounded-md bg-foreground text-foreground-on-accent text-xs px-2 py-1 shadow-md z-popover',
              placementClasses[placement],
            )}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
