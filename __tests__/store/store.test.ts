import { categoryMonth, computeBudget, getMonth } from '@/engine/budget';
import { useStore } from '@/store/store';
import { RTA, type BudgetData } from '@/store/types';
import { DEFAULT_CURRENCY } from '@/utils/money';
import { $, LAST_MONTH, makeBudget, NOW, THIS_MONTH } from '../helpers/budget';

beforeAll(() => jest.useFakeTimers({ now: NOW }));
afterAll(() => jest.useRealTimers());

const store = () => useStore.getState();
const active = (): BudgetData => store().budgets[store().activeBudgetId!];
const month = () => getMonth(computeBudget(active()), THIS_MONTH);

beforeEach(() => {
  const d = makeBudget();
  useStore.setState({ budgets: { [d.id]: d }, activeBudgetId: d.id, sync: {} });
});

describe('budgets', () => {
  it('createBudget makes a default budget with categories and switches to it', () => {
    const id = store().createBudget('  Home  ', DEFAULT_CURRENCY, 'default');
    expect(store().activeBudgetId).toBe(id);
    expect(active().name).toBe('Home');
    expect(active().categories.length).toBeGreaterThan(5);
  });

  it('deleting the active budget switches to another', () => {
    const first = store().activeBudgetId!;
    const second = store().createBudget('Two', DEFAULT_CURRENCY, 'empty');
    store().deleteBudget(second);
    expect(store().activeBudgetId).toBe(first);
  });
});

describe('accounts', () => {
  it('a new cash account adds its starting balance to Ready to Assign', () => {
    store().addAccount({ name: 'Savings', type: 'savings', balance: $(500), date: `${THIS_MONTH}-01` });
    expect(month().readyToAssign).toBe($(500));
  });

  it('a new credit card gets a payment category and its balance becomes debt, not Ready to Assign', () => {
    const id = store().addAccount({ name: 'Amex', type: 'creditCard', balance: -$(300), date: `${THIS_MONTH}-01` });
    expect(active().categories.some((c) => c.linkedAccountId === id)).toBe(true);
    expect(month().readyToAssign).toBe(0);
  });

  it('rejects an account without a name or with a bad date', () => {
    expect(store().addAccount({ name: '  ', type: 'checking', balance: 0, date: `${THIS_MONTH}-01` })).toBe('');
    expect(store().addAccount({ name: 'X', type: 'checking', balance: 0, date: 'nope' })).toBe('');
  });
});

describe('transactions', () => {
  it('saves spending, creates the payee and remembers its category', () => {
    store().saveTransaction({ accountId: 'checking', date: `${THIS_MONTH}-03`, amount: -$(20), categoryId: 'groceries', payeeName: 'Market' });
    const p = active().payees.find((x) => x.name === 'Market')!;
    expect(p.lastCategoryId).toBe('groceries');
    expect(categoryMonth(month(), 'groceries').activity).toBe(-$(20));
  });

  it('a transfer creates a linked mirror and deleting one side deletes both', () => {
    const id = store().saveTransaction({ accountId: 'checking', date: `${THIS_MONTH}-03`, amount: -$(50), categoryId: null, transferAccountId: 'visa' });
    const mine = active().transactions.find((t) => t.id === id)!;
    const mirror = active().transactions.find((t) => t.id === mine.transferTransactionId)!;
    expect(mirror).toMatchObject({ accountId: 'visa', amount: $(50), transferAccountId: 'checking' });
    store().deleteTransaction(id);
    expect(active().transactions).toHaveLength(0);
  });

  it('editing a transaction replaces it instead of adding another', () => {
    const id = store().saveTransaction({ accountId: 'checking', date: `${THIS_MONTH}-03`, amount: -$(20), categoryId: 'groceries' });
    store().saveTransaction({ id, accountId: 'checking', date: `${THIS_MONTH}-03`, amount: -$(25), categoryId: 'dining' });
    expect(active().transactions).toHaveLength(1);
    expect(active().transactions[0]).toMatchObject({ id, amount: -$(25), categoryId: 'dining' });
  });

  it('an invalid edit never deletes the original', () => {
    const id = store().saveTransaction({ accountId: 'checking', date: `${THIS_MONTH}-03`, amount: -$(20), categoryId: 'groceries' });
    store().saveTransaction({ id, accountId: 'checking', date: 'bad', amount: -$(25), categoryId: 'groceries' });
    expect(active().transactions).toHaveLength(1);
    expect(active().transactions[0].amount).toBe(-$(20));
  });

  it('income to Ready to Assign raises it', () => {
    store().saveTransaction({ accountId: 'checking', date: `${THIS_MONTH}-01`, amount: $(1000), categoryId: RTA });
    expect(month().readyToAssign).toBe($(1000));
  });
});

describe('assigning and moving money', () => {
  it('setAssigned sets and clears a category, ignoring bad months', () => {
    store().setAssigned(THIS_MONTH, 'groceries', $(100));
    expect(active().assigned[THIS_MONTH].groceries).toBe($(100));
    store().setAssigned(THIS_MONTH, 'groceries', 0);
    expect(active().assigned[THIS_MONTH].groceries).toBeUndefined();
    store().setAssigned('2026-13', 'groceries', $(5));
    expect(active().assigned['2026-13']).toBeUndefined();
  });

  it('applyAssignments writes several categories at once', () => {
    store().applyAssignments(THIS_MONTH, { groceries: $(10), dining: $(20), rent: 0 });
    expect(active().assigned[THIS_MONTH]).toEqual({ groceries: $(10), dining: $(20) });
  });

  it('moveMoney takes from one category and gives to another', () => {
    store().setAssigned(THIS_MONTH, 'groceries', $(100));
    store().moveMoney(THIS_MONTH, 'groceries', 'dining', $(30));
    expect(active().assigned[THIS_MONTH]).toEqual({ groceries: $(70), dining: $(30) });
  });

  it('moving from Ready to Assign only raises the destination', () => {
    store().saveTransaction({ accountId: 'checking', date: `${THIS_MONTH}-01`, amount: $(100), categoryId: RTA });
    store().moveMoney(THIS_MONTH, RTA, 'dining', $(40));
    expect(active().assigned[THIS_MONTH]).toEqual({ dining: $(40) });
    expect(month().readyToAssign).toBe($(60));
  });

  it('covering overspending brings the category back to zero', () => {
    store().setAssigned(THIS_MONTH, 'groceries', $(100));
    store().saveTransaction({ accountId: 'checking', date: `${THIS_MONTH}-02`, amount: -$(30), categoryId: 'dining' });
    store().moveMoney(THIS_MONTH, 'groceries', 'dining', $(30));
    expect(categoryMonth(month(), 'dining').available).toBe(0);
  });

  it('ignores zero, negative and same-category moves', () => {
    store().moveMoney(THIS_MONTH, 'groceries', 'dining', 0);
    store().moveMoney(THIS_MONTH, 'groceries', 'dining', -5);
    store().moveMoney(THIS_MONTH, 'groceries', 'groceries', $(5));
    expect(active().assigned[THIS_MONTH]).toBeUndefined();
  });
});

describe('scheduled transactions', () => {
  it('enters due occurrences and moves the next date forward', () => {
    store().saveScheduled({ accountId: 'checking', nextDate: `${LAST_MONTH}-15`, frequency: 'monthly', amount: -$(10), payeeId: null, categoryId: 'rent' });
    // saveScheduled processes right away: Oct 15 and Nov 15 are due on Nov 15.
    expect(active().transactions).toHaveLength(2);
    expect(active().scheduled[0].nextDate).toBe('2026-12-15');
    expect(active().transactions.every((t) => !t.approved)).toBe(true);
  });

  it('a one-time future schedule stays until its date, then disappears once entered', () => {
    const id = store().saveScheduled({ accountId: 'checking', nextDate: '2026-12-01', frequency: 'once', amount: -$(10), payeeId: null, categoryId: 'rent' });
    expect(active().transactions).toHaveLength(0);
    store().enterScheduledNow(id);
    expect(active().transactions).toHaveLength(1);
    expect(active().scheduled).toHaveLength(0);
  });
});

describe('importBudget', () => {
  it('adds a valid budget as a new one, never overwriting', () => {
    const before = Object.keys(store().budgets).length;
    expect(store().importBudget(makeBudget({ name: 'Mine' }))).toBe(true);
    expect(Object.keys(store().budgets)).toHaveLength(before + 1);
    expect(active().name).toBe('Mine (imported)');
    expect(active().id).not.toBe('b1');
  });

  it('rejects corrupt data', () => {
    expect(store().importBudget({ nope: true })).toBe(false);
    expect(store().importBudget(null)).toBe(false);
  });
});
