import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { EGP, fmtInt, fmtMoney } from './format';
import { useTickUp } from './useTickUp';

type Tone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export type MetricCardProps = {
  label: string;
  value: number | null | undefined;
  format?: 'money' | 'int';
  suffix?: string;
  meta?: ReactNode;
  tone?: Tone;
  /* When true and value resolves to 0 / nullish, render an em-dash instead of "0".
   * This makes "no data yet" feel intentional. */
  emDashOnZero?: boolean;
  className?: string;
};

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: [0, 0, 0.2, 1] as const } },
};

const toneAccentClass: Record<Tone, string> = {
  default: 'text-foreground',
  accent: 'text-accent',
  success: 'text-success-foreground',
  warning: 'text-warning-foreground',
  danger: 'text-danger-foreground',
  info: 'text-info-foreground',
};

export function MetricCard({
  label,
  value,
  format = 'money',
  suffix,
  meta,
  tone = 'default',
  emDashOnZero = true,
  className,
}: MetricCardProps) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const animated = useTickUp(numeric);
  const showDash = emDashOnZero && numeric === 0;
  const displayValue = showDash
    ? '—'
    : format === 'money'
      ? fmtMoney(animated)
      : fmtInt(animated);
  const displaySuffix = showDash ? '' : (suffix ?? (format === 'money' ? EGP : ''));

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ y: -2 }}
      transition={{ y: { duration: 0.15 } }}
      className={cn(
        'rounded-lg border border-border-subtle bg-surface-elevated shadow-sm',
        'hover:shadow-md transition-shadow duration-150 p-5 tabular-num',
        className,
      )}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted mb-2">
        {label}
      </p>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn('text-3xl font-semibold', toneAccentClass[tone])}
          dir="ltr"
        >
          {displayValue}
        </span>
        {displaySuffix && (
          <span className="text-sm text-foreground-tertiary">{displaySuffix}</span>
        )}
      </div>
      {meta != null && (
        <p className="text-xs text-foreground-tertiary mt-2">{meta}</p>
      )}
    </motion.div>
  );
}
