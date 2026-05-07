import { fromZonedTime, toZonedTime } from 'date-fns-tz';

const CAIRO_TZ = 'Africa/Cairo';

/**
 * Given a target date string (YYYY-MM-DD, interpreted as a Cairo calendar date)
 * and a rollover time string (HH:MM, default "00:00"), returns the UTC start/end
 * of the "shift day" window for that date.
 *
 * Shift day = [rollover_time on target_date, rollover_time on target_date + 1 day)
 */
export function cairoDayWindow(
  targetDate: string,
  rolloverTime: string = '00:00',
): { startUtc: Date; endUtc: Date } {
  const [hStr, mStr] = rolloverTime.split(':');
  const h = parseInt(hStr ?? '0', 10);
  const m = parseInt(mStr ?? '0', 10);

  const [yStr, moStr, dStr] = targetDate.split('-');
  const y = parseInt(yStr!, 10);
  const mo = parseInt(moStr!, 10) - 1; // 0-based month
  const d = parseInt(dStr!, 10);

  // Build a Date that represents the rollover time on targetDate in Cairo TZ
  const startZoned = new Date(y, mo, d, h, m, 0, 0);
  // Convert from Cairo local → UTC
  const startUtc = fromZonedTime(startZoned, CAIRO_TZ);

  // End = start + 24 hours
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

  return { startUtc, endUtc };
}

/** Format a UTC Date as dd/mm/yyyy HH:MM in Cairo TZ (Western digits). */
export function formatCairo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-GB', {
    timeZone: CAIRO_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** Format a UTC Date as dd/mm/yyyy in Cairo TZ. */
export function formatCairoDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB', {
    timeZone: CAIRO_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Today's date in Cairo TZ as YYYY-MM-DD. */
export function cairoToday(): string {
  const d = toZonedTime(new Date(), CAIRO_TZ);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}
