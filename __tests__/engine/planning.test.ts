import { assignUpTo, autoAssign } from '@/engine/autoAssign';
import { computeBudget, getMonth } from '@/engine/budget';
import { moneyPlan } from '@/engine/moveSuggestions';
import { RTA } from '@/store/types';
import { $, assign, income, LAST_MONTH, makeBudget, NOW, setTarget, spend, THIS_MONTH } from '../helpers/budget';

beforeAll(() => jest.useFakeTimers({ now: NOW }));
afterAll(() => jest.useRealTimers());

const ALL = ['groceries', 'dining', 'rent'];
const rentTarget = { kind: 'needed' as const, amount: $(1200), cadence: 'monthly' as const, behavior: 'setAside' as const, createdMonth: LAST_MONTH };

describe('autoAssign', () => {
  it('underfunded: fills each target for the month', () => {
    const d = makeBudget();
    setTarget(d, 'rent', rentTarget);
    assign(d, THIS_MONTH, 'rent', 200);
    expect(autoAssign(d, computeBudget(d), THIS_MONTH, 'underfunded', ALL)).toEqual({ rent: $(1200) });
  });

  it('assignedLastMonth / spentLastMonth repeat last month', () => {
    const d = makeBudget();
    assign(d, LAST_MONTH, 'groceries', 300);
    spend(d, 'dining', 75, `${LAST_MONTH}-12`);
    const r = computeBudget(d);
    expect(autoAssign(d, r, THIS_MONTH, 'assignedLastMonth', ALL)).toEqual({ groceries: $(300) });
    expect(autoAssign(d, r, THIS_MONTH, 'spentLastMonth', ALL)).toEqual({ dining: $(75) });
  });

  it('resetAvailable brings available to zero; resetAssigned clears assigned', () => {
    const d = makeBudget();
    assign(d, THIS_MONTH, 'groceries', 100);
    spend(d, 'groceries', 30);
    const r = computeBudget(d);
    expect(autoAssign(d, r, THIS_MONTH, 'resetAvailable', ALL)).toEqual({ groceries: $(30) });
    expect(autoAssign(d, r, THIS_MONTH, 'resetAssigned', ALL)).toEqual({ groceries: 0 });
  });

  it('never returns categories that no longer exist', () => {
    const d = makeBudget();
    assign(d, LAST_MONTH, 'gone', 50);
    expect(autoAssign(d, computeBudget(d), THIS_MONTH, 'assignedLastMonth', ['gone'])).toEqual({});
  });
});

describe('assignUpTo', () => {
  it('covers overspending first, then targets, until the money runs out', () => {
    const d = makeBudget();
    setTarget(d, 'rent', rentTarget);
    spend(d, 'dining', 40);
    const out = assignUpTo(computeBudget(d), THIS_MONTH, ALL, $(100));
    expect(out).toEqual({ dining: $(40), rent: $(60) });
  });
});

describe('moneyPlan (Move money suggestions)', () => {
  it('suggests Ready to Assign first, then spare categories, and puts overspending first', () => {
    const d = makeBudget();
    income(d, 50);
    assign(d, THIS_MONTH, 'groceries', 100); // no target: all spare
    spend(d, 'dining', 120); // overspent by 120
    // income 50 - assigned 100 = -50 RTA -> nothing unassigned to offer
    const plan = moneyPlan(d, getMonth(computeBudget(d), THIS_MONTH));
    expect(plan.needs[0]).toEqual({ id: 'dining', amount: $(120), overspent: true });
    expect(plan.suggestions).toEqual([{ from: 'groceries', to: 'dining', amount: $(100) }]);
    expect(plan.totalNeeded).toBe($(120));
    expect(plan.totalSpare).toBe($(100));
  });

  it('uses unassigned money before category money', () => {
    const d = makeBudget();
    income(d, 500);
    assign(d, THIS_MONTH, 'groceries', 100);
    spend(d, 'dining', 30);
    const plan = moneyPlan(d, getMonth(computeBudget(d), THIS_MONTH));
    expect(plan.suggestions[0]).toEqual({ from: RTA, to: 'dining', amount: $(30) });
  });

  it('never takes from credit card payment categories', () => {
    const d = makeBudget();
    assign(d, THIS_MONTH, 'visaPay', 200);
    spend(d, 'dining', 30);
    const plan = moneyPlan(d, getMonth(computeBudget(d), THIS_MONTH));
    expect(plan.spares.find((s) => s.id === 'visaPay')).toBeUndefined();
  });

  it('ignores hidden categories', () => {
    const d = makeBudget();
    d.categories.find((c) => c.id === 'dining')!.hidden = true;
    spend(d, 'dining', 30);
    expect(moneyPlan(d, getMonth(computeBudget(d), THIS_MONTH)).needs).toEqual([]);
  });
});
