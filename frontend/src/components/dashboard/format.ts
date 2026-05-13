/* Number formatting helpers used across the dashboard.
 * Western digits via `ar-EG-u-nu-latn` to match POS, reports, and owner-api. */

export function fmtMoney(n: number): string {
  return Number(n).toLocaleString('ar-EG-u-nu-latn', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtInt(n: number): string {
  return Math.round(Number(n)).toLocaleString('ar-EG-u-nu-latn', {
    maximumFractionDigits: 0,
  });
}

export function fmtWeight(n: number): string {
  return Number(n).toLocaleString('ar-EG-u-nu-latn', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export const EGP = 'ج.م';

/* Cairo timezone "today" — server's calendar day, used for owner queries. */
export function cairoTodayIso(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

export function cairoCurrentHour(): number {
  const hh = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    hour12: false,
  }).format(new Date());
  return Number(hh);
}

export function daysAgoIso(n: number): string {
  const today = cairoTodayIso();
  const d = new Date(`${today}T00:00:00`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/* Convert API-numeric (string or number) to number safely. */
export function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
