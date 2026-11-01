import { addDays, addMonthsToDate, daysInMonth, monthOf } from '@/utils/date';
import type { Frequency, ISODate } from '@/store/types';

export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'once', label: 'Never (once)' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'everyOtherWeek', label: 'Every other week' },
  { value: 'twiceAMonth', label: 'Twice a month' },
  { value: 'every4Weeks', label: 'Every 4 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'everyOtherMonth', label: 'Every other month' },
  { value: 'every3Months', label: 'Every 3 months' },
  { value: 'every4Months', label: 'Every 4 months' },
  { value: 'twiceAYear', label: 'Twice a year' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'everyOtherYear', label: 'Every other year' },
];

export const frequencyLabel = (f: Frequency) => FREQUENCIES.find((x) => x.value === f)?.label ?? f;

/** Returns the next occurrence after `date`, or null for one-time schedules. */
export function nextOccurrence(date: ISODate, f: Frequency): ISODate | null {
  switch (f) {
    case 'once':
      return null;
    case 'daily':
      return addDays(date, 1);
    case 'weekly':
      return addDays(date, 7);
    case 'everyOtherWeek':
      return addDays(date, 14);
    case 'every4Weeks':
      return addDays(date, 28);
    case 'twiceAMonth': {
      // 15th and last day of month pattern, anchored on the current day.
      const day = Number(date.slice(8, 10));
      const m = monthOf(date);
      if (day < 15) return `${m}-15`;
      const last = daysInMonth(m);
      if (day < last) return `${m}-${String(last).padStart(2, '0')}`;
      return addMonthsToDate(`${m}-15`, 1);
    }
    case 'monthly':
      return addMonthsToDate(date, 1);
    case 'everyOtherMonth':
      return addMonthsToDate(date, 2);
    case 'every3Months':
      return addMonthsToDate(date, 3);
    case 'every4Months':
      return addMonthsToDate(date, 4);
    case 'twiceAYear':
      return addMonthsToDate(date, 6);
    case 'yearly':
      return addMonthsToDate(date, 12);
    case 'everyOtherYear':
      return addMonthsToDate(date, 24);
  }
}

/** Upcoming occurrences from `from` (inclusive) until `until` (inclusive). */
export function occurrencesUntil(start: ISODate, f: Frequency, until: ISODate, max = 60): ISODate[] {
  const out: ISODate[] = [];
  let d: ISODate | null = start;
  while (d && d <= until && out.length < max) {
    out.push(d);
    d = nextOccurrence(d, f);
  }
  return out;
}
