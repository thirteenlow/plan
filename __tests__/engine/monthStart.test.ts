import { computeBudget, getMonth } from '@/engine/budget';
import { periodFor } from '@/engine/history';
import { spendingPace } from '@/engine/insights';
import { incomeVsExpense } from '@/engine/reports';
import {
  addMonthsToDate,
  calendarMonth,
  dayInMonth,
  monthDates,
  monthEndDate,
  monthLength,
  monthOf,
  monthStartDate,
  setActiveMonthStarts,
  startDayFor,
  validMonthStarts,
  withMonthStart,
} from '@/utils/date';
import { $, makeBudget, spend } from '../helpers/budget';

afterEach(() => setActiveMonthStarts([]));

// Switched from the 1st to the 14th in November 2026.
const PAYDAY = [{ from: '2026-11', day: 14 }];

describe('months that start on pay day', () => {
  it('keeps months before the change as they were and stretches the month it was made in', () => {
    setActiveMonthStarts(PAYDAY);
    expect(monthOf('2026-10-31')).toBe('2026-10');
    expect(monthOf('2026-11-05')).toBe('2026-11');
    expect(monthOf('2026-12-13')).toBe('2026-11');
    expect(monthOf('2026-12-14')).toBe('2026-12');
    expect(monthOf('2027-01-13')).toBe('2026-12');
    expect(calendarMonth('2026-12-13')).toBe('2026-12');
    expect(monthStartDate('2026-10')).toBe('2026-10-01');
    expect(monthEndDate('2026-10')).toBe('2026-10-31');
    expect(monthStartDate('2026-11')).toBe('2026-11-01');
    expect(monthEndDate('2026-11')).toBe('2026-12-13');
    expect(monthEndDate('2026-12')).toBe('2027-01-13');
    expect(monthLength('2027-02')).toBe(28); // 14 Feb – 13 Mar
    expect(dayInMonth('2026-12-14')).toBe(1);
    expect(monthDates('2026-10', PAYDAY, 'DMY')).toBeNull();
    expect(monthDates('2026-11', PAYDAY, 'DMY')).toBe('1 Nov – 13 Dec');
    expect(monthDates('2026-12', PAYDAY, 'MDY')).toBe('Dec 14 – Jan 13');
  });

  it('changing the day again moves no earlier month', () => {
    const later = withMonthStart(PAYDAY, '2027-03', 1);
    expect(later).toEqual([...PAYDAY, { from: '2027-03', day: 1 }]);
    expect(monthDates('2027-02', later, 'DMY')).toBe('14 Feb – 13 Mar');
    expect(monthDates('2027-03', later, 'DMY')).toBe('14 Mar – 31 Mar');
    expect(monthDates('2027-04', later, 'DMY')).toBeNull();
    expect(startDayFor('2027-02', later)).toBe(14);
    // Choosing again in the same month replaces that month's choice.
    expect(withMonthStart(PAYDAY, '2026-11', 20)).toEqual([{ from: '2026-11', day: 20 }]);
    expect(withMonthStart(PAYDAY, '2026-11', 1)).toEqual([]);
  });

  it('keeps calendar arithmetic on the calendar', () => {
    setActiveMonthStarts(PAYDAY);
    expect(addMonthsToDate('2027-01-05', 1)).toBe('2027-02-05');
    expect(addMonthsToDate('2027-01-31', 1)).toBe('2027-02-28');
  });

  it('accepts only days every month has', () => {
    expect(validMonthStarts([{ from: '2026-11', day: 29 }, { from: 'nope', day: 5 }, { from: '2026-12', day: 14.5 }, { from: '2027-01', day: 1 }])).toEqual([]);
    expect(validMonthStarts('14')).toEqual([]);
    expect(validMonthStarts([{ from: '2027-01', day: 3 }, { from: '2026-11', day: 28 }])).toEqual([
      { from: '2026-11', day: 28 },
      { from: '2027-01', day: 3 },
    ]);
  });

  it('counts spending in the pay-day month in the budget, reports and history', () => {
    setActiveMonthStarts(PAYDAY);
    const d = makeBudget();
    const cat = d.categories.find((c) => !c.linkedAccountId)!;
    spend(d, cat.id, 20, '2026-11-05');
    spend(d, cat.id, 30, '2026-12-13');
    spend(d, cat.id, 40, '2026-12-14');
    const r = computeBudget(d, '2026-12');
    expect(getMonth(r, '2026-11').categories[cat.id]?.activity).toBe(-$(50));
    expect(getMonth(r, '2026-12').categories[cat.id]?.activity).toBe(-$(40));
    expect(incomeVsExpense(d, '2026-11', '2026-12').map((x) => x.spending)).toEqual([$(50), $(40)]);
    expect(periodFor('month', '2026-12')).toEqual({ from: '2026-12-14', to: '2027-01-13' });
    const pace = spendingPace(d, '2026-12', '2026-12-15');
    expect(pace.days).toBe(31);
    expect(pace.current).toEqual([$(40), $(40)]);
    expect(pace.previous.length).toBe(43);
  });
});
