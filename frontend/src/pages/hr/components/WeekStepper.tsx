import { ChevronRight, ChevronLeft } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { formatPayDate, shiftWeek } from './utils';

/**
 * Weekly pay-date selector (salaries are paid every Thursday). `value` is a
 * Thursday as YYYY-MM-DD. RTL: right arrow steps to the earlier week, left
 * arrow to the later week, matching reading direction.
 */
export function WeekStepper({
  value,
  onChange,
}: {
  value: string;
  onChange: (date: string) => void;
}) {
  const btn =
    'size-8 flex items-center justify-center rounded-md border border-border-default bg-surface-elevated ' +
    'text-foreground-muted hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer';

  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={ar.hr.salary.prevWeek} className={btn} onClick={() => onChange(shiftWeek(value, -1))}>
        <ChevronRight size={16} />
      </button>
      <span className="min-w-32 text-center text-sm font-medium text-foreground tabular-num">
        {formatPayDate(value)}
      </span>
      <button type="button" aria-label={ar.hr.salary.nextWeek} className={btn} onClick={() => onChange(shiftWeek(value, 1))}>
        <ChevronLeft size={16} />
      </button>
    </div>
  );
}
