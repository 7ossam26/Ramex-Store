import type { HrSalaryDisbursement, HrSalaryAdjustment } from '@/lib/hr-api';

export function fmt(v: string | number) {
  return Number(v).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function toMonthDate(ym: string) {
  return `${ym}-01`;
}

/** Current calendar month as "YYYY-MM". */
export function currentMonthYM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** The month after the current calendar month as "YYYY-MM". */
export function nextMonthYM() {
  const d = new Date();
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
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
    sub: d.month.slice(0, 7),
  }));

  const fromAdjustments: ActivityItem[] = adjustments.map((a) => ({
    id: `adj-${a.id}`,
    date: a.created_at,
    kind: a.kind,
    amount: Number(a.amount_egp),
    sub: a.reason_ar ?? a.salary_month.slice(0, 7),
  }));

  return [...fromSalaries, ...fromAdjustments].sort(
    (x, y) => new Date(y.date).getTime() - new Date(x.date).getTime(),
  );
}
