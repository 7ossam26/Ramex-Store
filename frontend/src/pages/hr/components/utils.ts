import type { HrSalaryDisbursement, HrSalaryAdjustment } from '@/lib/hr-api';
import { cairoTodayIso } from '@/components/dashboard/format';

export function fmt(v: string | number) {
  return Number(v).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Weekly pay dates (salaries are paid every Thursday) ────────────────────

const THURSDAY = 4;

function parseIso(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isThursday(date: string): boolean {
  return parseIso(date).getUTCDay() === THURSDAY;
}

/** This week's pay Thursday in Cairo: today if Thursday, otherwise the coming Thursday. */
export function currentPayThursday(): string {
  const d = parseIso(cairoTodayIso());
  d.setUTCDate(d.getUTCDate() + ((THURSDAY - d.getUTCDay() + 7) % 7));
  return toIso(d);
}

/** Move a pay date by whole weeks. */
export function shiftWeek(date: string, weeks: number): string {
  const d = parseIso(date);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return toIso(d);
}

/** "الخميس 08/10/2026" — Western digits. */
export function formatPayDate(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-');
  return `الخميس ${d}/${m}/${y}`;
}

/** Label for a salary period: weekly Thursday date, or "YYYY-MM" for legacy monthly rows. */
function periodLabel(date: string, weekly: boolean): string {
  return weekly ? formatPayDate(date) : date.slice(0, 7);
}

export const inputCls =
  'h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground ' +
  'placeholder:text-foreground-tertiary transition-colors duration-75 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent';

// ─── Activity timeline ──────────────────────────────────────────────────────

export type ActivityItem = {
  id: string;
  date: string;
  kind: 'salary' | 'advance' | 'deduction';
  amount: number;
  sub: string;
};

/** Merge salary disbursements + adjustments into one chronological timeline (newest first). */
export function buildActivity(
  disbursements: HrSalaryDisbursement[],
  adjustments: HrSalaryAdjustment[],
): ActivityItem[] {
  const fromSalaries: ActivityItem[] = disbursements.map((d) => ({
    id: `salary-${d.id}`,
    date: d.created_at,
    kind: 'salary',
    amount: Number(d.net_egp),
    sub: periodLabel(d.month, d.pay_period === 'week'),
  }));

  const fromAdjustments: ActivityItem[] = adjustments.map((a) => ({
    id: `adj-${a.id}`,
    date: a.created_at,
    kind: a.kind,
    amount: Number(a.amount_egp),
    sub: a.reason_ar ?? periodLabel(a.salary_month, isThursday(a.salary_month)),
  }));

  return [...fromSalaries, ...fromAdjustments].sort(
    (x, y) => new Date(y.date).getTime() - new Date(x.date).getTime(),
  );
}
