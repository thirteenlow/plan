import { availableTone, categoryMonth, computeBudget, getMonth, paymentCategoryFor, targetMonthly } from '@/engine/budget';
import { RTA } from '@/store/types';
import { $, assign, income, LAST_MONTH, makeBudget, NOW, setTarget, spend, THIS_MONTH, tx } from '../helpers/budget';

beforeAll(() => jest.useFakeTimers({ now: NOW }));
afterAll(() => jest.useRealTimers());

const month = (data: ReturnType<typeof makeBudget>, m = THIS_MONTH) => getMonth(computeBudget(data), m);

describe('Ready to Assign', () => {
  it('is income minus what has been assigned', () => {
    const d = makeBudget();
    income(d, 3000);
    assign(d, THIS_MONTH, 'groceries', 400);
    assign(d, THIS_MONTH, 'rent', 1500);
    expect(month(d).readyToAssign).toBe($(1100));
    expect(month(d).income).toBe($(3000));
    expect(month(d).assigned).toBe($(1900));
  });

  it('goes negative when more is assigned than you have', () => {
    const d = makeBudget();
    income(d, 100);
    assign(d, THIS_MONTH, 'groceries', 150);
    expect(month(d).readyToAssign).toBe(-$(50));
  });

  it('carries unassigned income forward to next month', () => {
    const d = makeBudget();
    income(d, 500, `${LAST_MONTH}-02`);
    assign(d, LAST_MONTH, 'groceries', 200);
    expect(month(d, LAST_MONTH).readyToAssign).toBe($(300));
    expect(month(d).readyToAssign).toBe($(300));
  });

  it('pulls future assignments back into earlier months', () => {
    const d = makeBudget();
    income(d, 500);
    assign(d, '2026-12', 'groceries', 500);
    expect(month(d).readyToAssign).toBe(0);
    expect(month(d).assignedInFuture).toBe($(500));
  });

  it('counts uncategorized transactions toward Ready to Assign', () => {
    const d = makeBudget();
    income(d, 100);
    tx(d, { amount: -$(30), date: `${THIS_MONTH}-03`, categoryId: null });
    expect(month(d).readyToAssign).toBe($(70));
  });
});

describe('Available and rollover', () => {
  it('available = carryover + assigned + activity', () => {
    const d = makeBudget();
    income(d, 1000);
    assign(d, THIS_MONTH, 'groceries', 400);
    spend(d, 'groceries', 120);
    const cm = categoryMonth(month(d), 'groceries');
    expect(cm).toMatchObject({ assigned: $(400), activity: -$(120), available: $(280), carryover: 0 });
  });

  it('rolls a positive balance into next month', () => {
    const d = makeBudget();
    income(d, 1000, `${LAST_MONTH}-01`);
    assign(d, LAST_MONTH, 'groceries', 300);
    spend(d, 'groceries', 100, `${LAST_MONTH}-10`);
    assign(d, THIS_MONTH, 'groceries', 50);
    const cm = categoryMonth(month(d), 'groceries');
    expect(cm.carryover).toBe($(200));
    expect(cm.available).toBe($(250));
  });

  it('does not roll cash overspending forward; it comes out of next month’s Ready to Assign', () => {
    const d = makeBudget();
    income(d, 1000, `${LAST_MONTH}-01`);
    assign(d, LAST_MONTH, 'dining', 50);
    spend(d, 'dining', 80, `${LAST_MONTH}-10`);
    const last = categoryMonth(month(d, LAST_MONTH), 'dining');
    expect(last.available).toBe(-$(30));
    expect(last.cashOverspent).toBe($(30));
    const now = month(d);
    expect(categoryMonth(now, 'dining').carryover).toBe(0);
    expect(now.overspentLastMonth).toBe($(30));
    expect(now.readyToAssign).toBe($(1000 - 50 - 30));
  });

  it('counts overspent categories', () => {
    const d = makeBudget();
    spend(d, 'dining', 10);
    spend(d, 'groceries', 20);
    expect(month(d).overspentCount).toBe(2);
  });
});

describe('Credit cards', () => {
  it('moves funded card spending into the card’s payment category', () => {
    const d = makeBudget();
    income(d, 1000);
    assign(d, THIS_MONTH, 'groceries', 100);
    spend(d, 'groceries', 60, `${THIS_MONTH}-05`, 'visa');
    const mb = month(d);
    expect(categoryMonth(mb, 'groceries').available).toBe($(40));
    expect(categoryMonth(mb, 'visaPay').activity).toBe($(60));
    expect(categoryMonth(mb, 'visaPay').available).toBe($(60));
  });

  it('only moves what the category could cover; the rest is credit overspending (debt)', () => {
    const d = makeBudget();
    income(d, 1000);
    assign(d, THIS_MONTH, 'groceries', 50);
    spend(d, 'groceries', 80, `${THIS_MONTH}-05`, 'visa');
    const mb = month(d);
    const g = categoryMonth(mb, 'groceries');
    expect(g.available).toBe(-$(30));
    expect(g.creditOverspent).toBe($(30));
    expect(g.cashOverspent).toBe(0);
    expect(categoryMonth(mb, 'visaPay').available).toBe($(50));
    expect(availableTone(g)).toBe('creditOverspent');
  });

  it('paying the card from checking lowers the payment category', () => {
    const d = makeBudget();
    income(d, 1000);
    assign(d, THIS_MONTH, 'groceries', 100);
    spend(d, 'groceries', 100, `${THIS_MONTH}-05`, 'visa');
    tx(d, { amount: -$(100), date: `${THIS_MONTH}-20`, accountId: 'checking', transferAccountId: 'visa' });
    expect(categoryMonth(month(d), 'visaPay').available).toBe(0);
  });

  it('finds the payment category for a card', () => {
    expect(paymentCategoryFor(makeBudget(), 'visa')?.id).toBe('visaPay');
    expect(paymentCategoryFor(makeBudget(), 'checking')).toBeUndefined();
  });
});

describe('Split transactions', () => {
  it('spreads activity across each split line', () => {
    const d = makeBudget();
    tx(d, {
      amount: -$(50),
      date: `${THIS_MONTH}-04`,
      subtransactions: [
        { id: 's1', categoryId: 'groceries', amount: -$(30) },
        { id: 's2', categoryId: 'dining', amount: -$(20) },
      ],
    });
    const mb = month(d);
    expect(categoryMonth(mb, 'groceries').activity).toBe(-$(30));
    expect(categoryMonth(mb, 'dining').activity).toBe(-$(20));
  });
});

describe('Targets', () => {
  it('a monthly "needed" target is underfunded until fully assigned', () => {
    const d = makeBudget();
    income(d, 1000);
    setTarget(d, 'rent', { kind: 'needed', amount: $(1200), cadence: 'monthly', behavior: 'setAside', createdMonth: LAST_MONTH });
    assign(d, THIS_MONTH, 'rent', 200);
    const t = categoryMonth(month(d), 'rent').target!;
    expect(t.neededThisMonth).toBe($(1200));
    expect(t.underfunded).toBe($(1000));
    expect(t.funded).toBe(false);
    expect(month(d).underfunded).toBe($(1000));

    assign(d, THIS_MONTH, 'rent', 1200);
    expect(categoryMonth(month(d), 'rent').target!.funded).toBe(true);
  });

  it('a snoozed target asks for nothing this month', () => {
    const d = makeBudget();
    setTarget(d, 'rent', { kind: 'needed', amount: $(1200), cadence: 'monthly', behavior: 'setAside', createdMonth: LAST_MONTH, snoozedMonth: THIS_MONTH });
    const t = categoryMonth(month(d), 'rent').target!;
    expect(t.snoozed).toBe(true);
    expect(t.underfunded).toBe(0);
  });

  it('targetMonthly reports the monthly amount', () => {
    expect(targetMonthly({ kind: 'needed', amount: $(100), cadence: 'monthly', behavior: 'setAside', createdMonth: THIS_MONTH }, THIS_MONTH).thisMonth).toBe($(100));
  });
});

describe('availableTone', () => {
  const cm = (available: number) => ({ carryover: 0, assigned: 0, activity: 0, available, cashOverspent: available < 0 ? -available : 0, creditOverspent: 0 });
  it('maps balances to tones', () => {
    expect(availableTone(cm($(5)))).toBe('positive');
    expect(availableTone(cm(0))).toBe('zero');
    expect(availableTone(cm(-$(5)))).toBe('overspent');
  });
});

it('ignores income to off-budget (tracking) accounts', () => {
  const d = makeBudget();
  d.accounts.push({ id: 'house', name: 'House', type: 'asset', onBudget: false, closed: false, sort: 5 });
  tx(d, { amount: $(500000), date: `${THIS_MONTH}-01`, accountId: 'house', categoryId: RTA });
  expect(month(d).readyToAssign).toBe(0);
});
