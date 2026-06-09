/**
 * Working-day calendar utilities.
 *
 * PRD §20.3 lists the working-week as an open question; until configured per
 * org we default to Mon–Sat (Indian standard). When ScoringConfig gains a
 * working_days_mask, swap the constant for a config lookup.
 *
 * Day-of-week numbers follow JS Date.getDay(): 0=Sun, 1=Mon, … 6=Sat.
 */

const WORKING_DAYS = new Set<number>([1, 2, 3, 4, 5, 6]); // Mon-Sat

export function isWorkingDay(date: Date): boolean {
  return WORKING_DAYS.has(date.getDay());
}

/** Returns the start of day in local time (00:00:00.000). */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Returns the end of day in local time (23:59:59.999). */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** YYYY-MM-DD in local time. */
export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse a YYYY-MM-DD string into a local-midnight Date. */
export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

/** Inclusive list of working days between `from` and `to`. */
export function workingDaysBetween(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cursor = startOfDay(from);
  const end = startOfDay(to);
  while (cursor.getTime() <= end.getTime()) {
    if (isWorkingDay(cursor)) out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/**
 * Parses a HH:mm string (e.g. "10:00") into a Date today at that local time.
 * If the input is invalid, returns null.
 */
export function todayAtTime(hhmm: string): Date | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}
