import { RTA, type Account, type AccountType, type BudgetData, type Category, type Target, type Transaction } from '@/store/types';
import { DEFAULT_CURRENCY } from '@/utils/money';

/** Fixed "today" for tests: 15 Nov 2026. Engine code reads the clock through currentMonth()/today(). */
export const NOW = new Date('2026-11-15T12:00:00');
export const THIS_MONTH = '2026-11';
export const LAST_MONTH = '2026-10';

export const $ = (n: number) => Math.round(n * 1000);

let n = 0;
const id = (p: string) => `${p}${++n}`;

/**
 * Small hand-built budget: Checking (cash), Visa (credit card with payment category), one group with
 * Groceries / Dining / Rent. Add transactions and assignments with the helpers below.
 */
export function makeBudget(overrides: Partial<BudgetData> = {}) {
  const checking: Account = { id: 'checking', name: 'Checking', type: 'checking', onBudget: true, closed: false, sort: 0 };
  const visa: Account = { id: 'visa', name: 'Visa', type: 'creditCard', onBudget: true, closed: false, sort: 1 };
  const cats: Category[] = [
    { id: 'groceries', groupId: 'everyday', name: 'Groceries', hidden: false, sort: 0 },
    { id: 'dining', groupId: 'everyday', name: 'Dining Out', hidden: false, sort: 1 },
    { id: 'rent', groupId: 'everyday', name: 'Rent', hidden: false, sort: 2 },
    { id: 'visaPay', groupId: 'cc', name: 'Visa', hidden: false, sort: 0, linkedAccountId: 'visa' },
  ];
  const data: BudgetData = {
    id: 'b1',
    name: 'Test',
    createdAt: `${LAST_MONTH}-01`,
    lastOpenedAt: NOW.toISOString(),
    settings: { currency: DEFAULT_CURRENCY, dateFormat: 'MDY' },
    accounts: [checking, visa],
    groups: [
      { id: 'cc', name: 'Credit Card Payments', hidden: false, sort: 0, isCreditCardPayments: true },
      { id: 'everyday', name: 'Everyday', hidden: false, sort: 1 },
    ],
    categories: cats,
    payees: [],
    transactions: [],
    scheduled: [],
    assigned: {},
    ...overrides,
  };
  return data;
}

export function tx(data: BudgetData, t: Partial<Transaction> & { amount: number; date: string }): Transaction {
  const full: Transaction = { id: id('t'), accountId: 'checking', payeeId: null, categoryId: null, cleared: 'cleared', approved: true, ...t };
  data.transactions.push(full);
  return full;
}

export const income = (data: BudgetData, amount: number, date = `${THIS_MONTH}-01`) => tx(data, { amount: $(amount), date, categoryId: RTA });
export const spend = (data: BudgetData, categoryId: string, amount: number, date = `${THIS_MONTH}-05`, accountId = 'checking') =>
  tx(data, { amount: -$(amount), date, categoryId, accountId });

export function assign(data: BudgetData, month: string, categoryId: string, amount: number) {
  (data.assigned[month] ??= {})[categoryId] = $(amount);
}

export function addAccount(data: BudgetData, type: AccountType, name: string): Account {
  const a: Account = { id: id('a'), name, type, onBudget: !['asset', 'liability', 'mortgage', 'loan'].includes(type), closed: false, sort: data.accounts.length };
  data.accounts.push(a);
  return a;
}

export function setTarget(data: BudgetData, categoryId: string, target: Target) {
  data.categories.find((c) => c.id === categoryId)!.target = target;
}
