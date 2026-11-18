import type { DateFormat, ISODate, MonthKey, MonthStart } from '@/store/types';

const pad = (n: number) => String(n).padStart(2, '0');

let activeDateFormat: DateFormat = 'MDY';
/** The active budget's date order; set by the store whenever the budget changes. */
export const setActiveDateFormat = (f: DateFormat) => {
  activeDateFormat = f;
};


let monthStarts: MonthStart[] = [];
/**
 * The active budget's month starts (e.g. pay day on the 14th). A budget month is named by the calendar month it starts
 * in, and starts on the day the previous month's rule says, so changing the day never moves earlier months: switching
 * from the 1st to the 14th in November makes November run 1 Nov – 13 Dec, then 14 Dec – 13 Jan and so on.
 * Set by the store, like the date format.
 */
export const setActiveMonthStarts = (starts: unknown) => {
  monthStarts = validMonthStarts(starts);
};
export const activeMonthStarts = () => monthStarts;
/** A start day the budget can use: a whole day from 1 to 28 (every month has those). */
export const isMonthStartDay = (day: unknown): day is number => typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 28;
/** Well-formed month starts, oldest first, one per month, without ones that change nothing. */
export function validMonthStarts(starts: unknown): MonthStart[] {
  if (!Array.isArray(starts)) return [];
  const byMonth = new Map<MonthKey, number>();
  for (const x of starts as Partial<MonthStart>[]) {
    if (x && typeof x.from === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(x.from) && isMonthStartDay(x.day)) byMonth.set(x.from, x.day);
  }
  const out: MonthStart[] = [];
  for (const [from, day] of [...byMonth].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (day !== (out.at(-1)?.day ?? 1)) out.push({ from, day });
  }
  return out;
}
/** The start day in force for budget month `m`. */
export const startDayFor = (m: MonthKey, starts: MonthStart[] = monthStarts): number => {
  let day = 1;
  for (const s of starts) if (s.from <= m) day = s.day;
  return day;
};
/** The month starts after choosing `day` from budget month `from` on. */
export const withMonthStart = (starts: MonthStart[], from: MonthKey, day: number): MonthStart[] => validMonthStarts([...starts.filter((s) => s.from < from), { from, day }]);

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
/** The calendar month a date is in, whatever the budget's start day (for calendars and calendar arithmetic). */
export const calendarMonth = (d: ISODate): MonthKey => d.slice(0, 7);
/** The budget month a date belongs to (see setActiveMonthStarts). */
export const monthOf = (d: ISODate, starts: MonthStart[] = monthStarts): MonthKey => {
  const cal = d.slice(0, 7);
  return !starts.length || d >= monthStartDate(cal, starts) ? cal : addMonths(cal, -1);
};
export const currentMonth = (): MonthKey => monthOf(today());

/** The first and last day of a budget month, both inclusive. A month starts on the day the month before's rule says. */
export const monthStartDate = (m: MonthKey, starts: MonthStart[] = monthStarts): ISODate => `${m}-${pad(startDayFor(addMonths(m, -1), starts))}`;
export const monthEndDate = (m: MonthKey, starts: MonthStart[] = monthStarts): ISODate => addDays(monthStartDate(addMonths(m, 1), starts), -1);
/** How many days a budget month has. */
export const monthLength = (m: MonthKey, starts: MonthStart[] = monthStarts): number => daysBetween(monthStartDate(m, starts), monthEndDate(m, starts)) + 1;
/** Day 1, 2, … of its budget month a date is. */
export const dayInMonth = (d: ISODate, starts: MonthStart[] = monthStarts): number => daysBetween(monthStartDate(monthOf(d, starts), starts), d) + 1;

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
  const target = addMonths(calendarMonth(d), n);
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
/** "14 Nov – 13 Dec" (or "Nov 14 – Dec 13"): the dates of a budget month that isn't a calendar month; null if it is. */
export function monthDates(m: MonthKey, starts: MonthStart[] = monthStarts, fmt: DateFormat = activeDateFormat, always = false): string | null {
  const [from, to] = [monthStartDate(m, starts), monthEndDate(m, starts)];
  if (!always && from === `${m}-01` && to === `${m}-${pad(daysInMonth(m))}`) return null;
  const day = (d: ISODate) => {
    const dt = parseISO(d);
    return fmt === 'MDY' || fmt === 'YMD' ? `${MONTHS_SHORT[dt.getMonth()]} ${dt.getDate()}` : `${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]}`;
  };
  return `${day(from)} – ${day(to)}`;
}
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

/**
 * Months for a picker, easiest first: this year (January to December), then later years, then earlier years
 * (newest first). Months within a year stay in calendar order.
 */
export function monthPickerOrder(months: MonthKey[], current: MonthKey): MonthKey[] {
  const year = current.slice(0, 4);
  const rank = (y: string) => (y === year ? 0 : y > year ? 1 : 2);
  return [...months].sort((a, b) => {
    const ya = a.slice(0, 4);
    const yb = b.slice(0, 4);
    if (ya !== yb) return rank(ya) - rank(yb) || (rank(ya) === 2 ? (ya < yb ? 1 : -1) : ya < yb ? -1 : 1);
    return a < b ? -1 : 1;
  });
}
