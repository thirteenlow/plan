import { accountBalances, ageOfMoney } from '@/engine/accounts';
import { biggestPurchase, budgetHealth, insights, monthSnapshot, spendingPace } from '@/engine/insights';
import { petMood } from '@/engine/pet';
import { dailySpending, earliestMonth, incomeVsExpense, netWorthSeries, spendingByCategory } from '@/engine/reports';
import { frequencyLabel, nextOccurrence, occurrencesUntil } from '@/engine/scheduled';
import { formatMoney } from '@/utils/money';
import { $, assign, income, LAST_MONTH, makeBudget, NOW, spend, THIS_MONTH, tx } from '../helpers/budget';

beforeAll(() => jest.useFakeTimers({ now: NOW }));
afterAll(() => jest.useRealTimers());

const fmt = (m: number) => formatMoney(m);

describe('scheduled transactions', () => {
  it.each([
    ['2026-01-31', 'once', null],
    ['2026-01-31', 'daily', '2026-02-01'],
    ['2026-01-01', 'weekly', '2026-01-08'],
    ['2026-01-01', 'everyOtherWeek', '2026-01-15'],
    ['2026-01-01', 'every4Weeks', '2026-01-29'],
    ['2026-01-10', 'twiceAMonth', '2026-01-15'],
    ['2026-01-15', 'twiceAMonth', '2026-01-31'],
    ['2026-01-31', 'twiceAMonth', '2026-02-15'],
    ['2026-01-15', 'monthly', '2026-02-15'],
    ['2026-01-15', 'every3Months', '2026-04-15'],
    ['2026-01-15', 'twiceAYear', '2026-07-15'],
    ['2026-01-15', 'yearly', '2027-01-15'],
    ['2026-01-15', 'everyOtherYear', '2028-01-15'],
  ] as const)('%s %s -> %s', (date, f, next) => {
    expect(nextOccurrence(date, f)).toBe(next);
  });

  it('monthly on the 31st stays inside short months', () => {
    expect(nextOccurrence('2026-01-31', 'monthly')! <= '2026-02-28').toBe(true);
  });

  it('lists occurrences up to a date', () => {
    expect(occurrencesUntil('2026-01-01', 'weekly', '2026-01-22')).toEqual(['2026-01-01', '2026-01-08', '2026-01-15', '2026-01-22']);
    expect(occurrencesUntil('2026-01-01', 'daily', '2027-01-01', 5)).toHaveLength(5);
  });

  it('labels frequencies', () => expect(frequencyLabel('everyOtherWeek')).toBe('Every other week'));
});

describe('accounts', () => {
  it('splits cleared and uncleared balances', () => {
    const d = makeBudget();
    tx(d, { amount: $(100), date: `${THIS_MONTH}-01`, cleared: 'cleared' });
    tx(d, { amount: -$(30), date: `${THIS_MONTH}-02`, cleared: 'uncleared' });
    expect(accountBalances(d).checking).toEqual({ cleared: $(100), uncleared: -$(30), working: $(70) });
    expect(accountBalances(d).visa.working).toBe(0);
  });

  it('age of money counts days between income and spending', () => {
    const d = makeBudget();
    income(d, 100, `${THIS_MONTH}-01`);
    spend(d, 'groceries', 50, `${THIS_MONTH}-11`);
    expect(ageOfMoney(d)).toBe(10);
    expect(ageOfMoney(makeBudget())).toBeNull();
  });
});

describe('reports', () => {
  const data = () => {
    const d = makeBudget();
    d.payees.push({ id: 'p1', name: 'Market' });
    income(d, 2000, `${LAST_MONTH}-01`);
    spend(d, 'groceries', 100, `${LAST_MONTH}-03`);
    income(d, 2000);
    tx(d, { amount: -$(60), date: `${THIS_MONTH}-02`, categoryId: 'groceries', payeeId: 'p1' });
    spend(d, 'dining', 40, `${THIS_MONTH}-02`);
    tx(d, { amount: -$(500), date: `${THIS_MONTH}-20`, accountId: 'checking', transferAccountId: 'visa' }); // card payment isn't spending
    return d;
  };

  it('spending by category/payee, biggest first, ignoring transfers', () => {
    expect(spendingByCategory(data(), THIS_MONTH, THIS_MONTH, 'category')).toEqual([
      { id: 'groceries', name: 'Groceries', amount: $(60) },
      { id: 'dining', name: 'Dining Out', amount: $(40) },
    ]);
    expect(spendingByCategory(data(), THIS_MONTH, THIS_MONTH, 'payee')[0]).toEqual({ id: 'p1', name: 'Market', amount: $(60) });
    expect(spendingByCategory(data(), THIS_MONTH, THIS_MONTH, 'group')).toEqual([{ id: 'everyday', name: 'Everyday', amount: $(100) }]);
  });

  it('daily spending lands on the right day', () => {
    const days = dailySpending(data(), THIS_MONTH, 30);
    expect(days[1]).toBe($(100));
    expect(days.reduce((a, b) => a + b, 0)).toBe($(100));
  });

  it('income vs expense per month', () => {
    expect(incomeVsExpense(data(), LAST_MONTH, THIS_MONTH)).toEqual([
      { month: LAST_MONTH, income: $(2000), spending: $(100) },
      { month: THIS_MONTH, income: $(2000), spending: $(100) },
    ]);
  });

  it('net worth treats card balances as debt', () => {
    const d = makeBudget();
    income(d, 1000);
    spend(d, 'groceries', 200, `${THIS_MONTH}-04`, 'visa');
    expect(netWorthSeries(d, THIS_MONTH, THIS_MONTH)).toEqual([{ month: THIS_MONTH, assets: $(1000), debts: $(200), netWorth: $(800) }]);
  });

  it('earliest month is the earliest of creation and transactions', () => {
    const d = makeBudget();
    tx(d, { amount: 1, date: '2025-03-04' });
    expect(earliestMonth(d)).toBe('2025-03');
  });

  it('snapshot, pace and biggest purchase', () => {
    const d = data();
    expect(monthSnapshot(d, THIS_MONTH)).toMatchObject({ income: $(2000), spending: $(100), saved: $(1900), usualSpending: $(100) });
    const pace = spendingPace(d, THIS_MONTH, '2026-11-15');
    expect(pace.spentSoFar).toBe($(100));
    expect(pace.current).toHaveLength(15);
    expect(pace.projected).toBe($(200));
    expect(biggestPurchase(d, THIS_MONTH)).toEqual({ name: 'Market', amount: $(60) });
  });

  it('insights mention overspending', () => {
    const d = makeBudget();
    spend(d, 'dining', 20);
    expect(insights(d, THIS_MONTH, fmt).some((i) => i.label === 'Overspent' && i.value === '1')).toBe(true);
  });
});

describe('budget health and pet', () => {
  it('reports uncovered card debt', () => {
    const d = makeBudget();
    income(d, 1000);
    assign(d, THIS_MONTH, 'groceries', 50);
    spend(d, 'groceries', 80, `${THIS_MONTH}-04`, 'visa');
    const h = budgetHealth(d, THIS_MONTH);
    expect(h.cardDebt).toBe($(80));
    expect(h.cardUncovered).toBe($(30));
    expect(h.cash).toBe($(1000));
  });

  it('pet is worried by overspending and over-assigning, happy with an empty budget', () => {
    expect(petMood(makeBudget(), THIS_MONTH, '2026-11-15', fmt).mood).toBe('happy');
    const d = makeBudget();
    income(d, 10);
    assign(d, THIS_MONTH, 'rent', 500);
    spend(d, 'dining', 100);
    spend(d, 'groceries', 100);
    const m = petMood(d, THIS_MONTH, '2026-11-15', fmt);
    expect(m.score).toBeLessThan(45);
    expect(m.reasons[0].tone).toBe('bad');
    expect(m.reasons.some((r) => r.text.includes('more than you have'))).toBe(true);
  });
});
