import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/* Outer dashboard wrapper. Provides:
 *   - RTL container
 *   - Title + subtitle
 *   - Right-aligned "آخر تحديث" chip whose label updates every 5s
 *     without re-rendering child widgets. */
export function DashboardShell({
  title,
  subtitle,
  lastUpdatedMs,
  rightActions,
  children,
}: {
  title: string;
  subtitle?: string;
  lastUpdatedMs?: number;
  rightActions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.div
      className="space-y-6"
      dir="rtl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-sm text-foreground-muted">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {rightActions}
          {lastUpdatedMs != null && lastUpdatedMs > 0 && (
            <LastUpdatedChip ms={lastUpdatedMs} />
          )}
        </div>
      </header>

      <div className="space-y-8">{children}</div>
    </motion.div>
  );
}

function LastUpdatedChip({ ms }: { ms: number }) {
  const [label, setLabel] = useState(() => formatAgo(ms));

  useEffect(() => {
    setLabel(formatAgo(ms));
    const id = setInterval(() => setLabel(formatAgo(ms)), 5_000);
    return () => clearInterval(id);
  }, [ms]);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border border-border-subtle',
        'bg-surface px-2.5 py-1 text-xs',
      )}
      title={new Date(ms).toLocaleString('ar-EG-u-nu-latn')}
    >
      <span
        className="size-1.5 rounded-full bg-success animate-pulse"
        aria-hidden
      />
      <span style={{ color: '#16a34a', fontWeight: '500', fontSize: '0.875rem' }}>{label}</span>
    </span>
  );
}

function formatAgo(ms: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 5) return 'آخر تحديث: الآن';
  if (seconds < 60) return `آخر تحديث: قبل ${seconds} ثانية`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `آخر تحديث: قبل ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  return `آخر تحديث: قبل ${hours} ساعة`;
}
