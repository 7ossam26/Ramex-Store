import { ChevronRight, ChevronLeft } from 'lucide-react';
import { ar } from '@/i18n/ar';

const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/** "يونيو 2026" — Arabic month name, Western-digit year. */
export function formatMonthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return `${AR_MONTHS[m - 1] ?? ''} ${y}`;
}

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Month selector with prev/next arrows. RTL: right arrow steps to the earlier
 * month, left arrow to the later month, matching reading direction.
 */
export function MonthStepper({
  value,
  onChange,
}: {
  value: string;
  onChange: (ym: string) => void;
}) {
  const btn =
    'size-8 flex items-center justify-center rounded-md border border-border-default bg-surface-elevated ' +
    'text-foreground-muted hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer';

  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label={ar.hr.salary.prevMonth} className={btn} onClick={() => onChange(shiftMonth(value, -1))}>
        <ChevronRight size={16} />
      </button>
      <span className="min-w-28 text-center text-sm font-medium text-foreground tabular-num">
        {formatMonthLabel(value)}
      </span>
      <button type="button" aria-label={ar.hr.salary.nextMonth} className={btn} onClick={() => onChange(shiftMonth(value, 1))}>
        <ChevronLeft size={16} />
      </button>
    </div>
  );
}
