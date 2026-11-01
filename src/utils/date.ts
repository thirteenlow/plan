import type { DateFormat, ISODate, MonthKey } from '@/store/types';

const pad = (n: number) => String(n).padStart(2, '0');

let activeDateFormat: DateFormat = 'MDY';
/** The active budget's date order; set by the store whenever the budget changes. */
export const setActiveDateFormat = (f: DateFormat) => {
  activeDateFormat = f;
};

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = WEEKDAYS.map((d) => d.slice(0, 3));

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
}

export const today = (): ISODate => toISO(new Date());
export const monthOf = (d: ISODate): MonthKey => d.slice(0, 7);
export const currentMonth = (): MonthKey => monthOf(today());

export function addMonths(month: MonthKey, n: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

/** Number of months from a to b (b - a). */
export function monthDiff(a: MonthKey, b: MonthKey): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return by * 12 + bm - (ay * 12 + am);
}

export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function addDays(d: ISODate, n: number): ISODate {
  const dt = parseISO(d);
  dt.setDate(dt.getDate() + n);
  return toISO(dt);
}

/** Adds months, clamping the day to the end of the target month. */
export function addMonthsToDate(d: ISODate, n: number): ISODate {
  const target = addMonths(monthOf(d), n);
  const day = Math.min(Number(d.slice(8, 10)), daysInMonth(target));
  return `${target}-${pad(day)}`;
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

/** Count of a weekday (0-6) within a month. */
/** 1 → "1st", 22 → "22nd" */
export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
}

/** Monthly target due day: 0 is the last day of the month. */
export const dueDayLabel = (day: number | undefined) => (!day ? 'Last day of the month' : `The ${ordinal(day)}`);

export function weekdayCount(month: MonthKey, weekday: number): number {
  let count = 0;
  const n = daysInMonth(month);
  for (let day = 1; day <= n; day++) {
    if (parseISO(`${month}-${pad(day)}`).getDay() === weekday) count++;
  }
  return count;
}

export const monthLabel = (m: MonthKey) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const monthShort = (m: MonthKey) => `${MONTHS_SHORT[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

export function formatDate(d: ISODate, fmt: DateFormat = activeDateFormat): string {
  const [y, m, day] = d.split('-');
  if (fmt === 'DMY') return `${day}/${m}/${y}`;
  if (fmt === 'YMD') return `${y}-${m}-${day}`;
  return `${m}/${day}/${y}`;
}

/** "Today", "Yesterday", "Mon, 20 Mar 2026" */
export function friendlyDate(d: ISODate): string {
  const t = today();
  if (d === t) return 'Today';
  if (d === addDays(t, -1)) return 'Yesterday';
  if (d === addDays(t, 1)) return 'Tomorrow';
  const dt = parseISO(d);
  if (activeDateFormat === 'YMD') return `${WEEKDAYS_SHORT[dt.getDay()]}, ${d}`;
  const sameYear = dt.getFullYear() === new Date().getFullYear();
  const dm = activeDateFormat === 'MDY' ? `${MONTHS_SHORT[dt.getMonth()]} ${dt.getDate()}` : `${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]}`;
  return `${WEEKDAYS_SHORT[dt.getDay()]}, ${dm}${sameYear ? '' : ' ' + dt.getFullYear()}`;
}

/** "30 Oct 2026", "Oct 30, 2026" or "2026-10-30" depending on the budget's date format. */
export function shortDate(d: ISODate, fmt: DateFormat = activeDateFormat): string {
  const dt = parseISO(d);
  if (fmt === 'YMD') return d;
  if (fmt === 'MDY') return `${MONTHS_SHORT[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
  return `${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]} ${dt.getFullYear()}`;
}

/** "30 October 2026", "October 30, 2026" or "2026-10-30". */
export function longDate(d: ISODate, fmt: DateFormat = activeDateFormat): string {
  const dt = parseISO(d);
  if (fmt === 'YMD') return d;
  if (fmt === 'MDY') return `${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}
