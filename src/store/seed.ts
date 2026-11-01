import { addDays, addMonths, addMonthsToDate, currentMonth, daysInMonth, monthRange, today } from '@/utils/date';
import { computeBudget } from '@/engine/budget';
import { ACCOUNT_TYPE_INFO, isCreditType } from '@/utils/icons';
import { uid } from '@/utils/id';
import { toMilli } from '@/utils/money';
import {
  RTA,
  type Account,
  type AccountType,
  type BudgetData,
  type Category,
  type CategoryGroup,
  type CurrencyFormat,
  type Milli,
  type Target,
  type Transaction,
} from './types';

export type BudgetTemplate = 'default' | 'demo' | 'empty';

const DEFAULT_GROUPS: [string, string[]][] = [
  ['Bills', ['Rent', 'Electricity', 'Internet', 'Phone', 'Insurance', 'Subscriptions']],
  ['Everyday', ['Groceries', 'Dining Out', 'Transportation', 'Personal Care']],
  ['Fun', ['Entertainment', 'Shopping', 'Hobbies']],
  ['Goals', ['Vacation', 'Emergency Fund', 'New Laptop', 'Gifts']],
];

function emptyBudget(name: string, currency: CurrencyFormat): BudgetData {
  return {
    id: uid('b'),
    name: name.trim() || 'My Budget',
    createdAt: today(),
    lastOpenedAt: new Date().toISOString(),
    settings: { currency, dateFormat: currency.code === 'USD' ? 'MDY' : 'DMY' },
    accounts: [],
    groups: [],
    categories: [],
    payees: [],
    transactions: [],
    scheduled: [],
    assigned: {},
  };
}

function addDefaultCategories(b: BudgetData) {
  DEFAULT_GROUPS.forEach(([gName, cats], gi) => {
    const g: CategoryGroup = { id: uid('g'), name: gName, hidden: false, sort: gi };
    b.groups.push(g);
    cats.forEach((cName, ci) => b.categories.push({ id: uid('c'), groupId: g.id, name: cName, hidden: false, sort: ci }));
  });
}

export function buildBudget(name: string, currency: CurrencyFormat, template: BudgetTemplate): BudgetData {
  const b = emptyBudget(name, currency);
  if (template === 'empty') return b;
  addDefaultCategories(b);
  if (template === 'demo') addDemoData(b);
  return b;
}

/** Deterministic pseudo random so the demo looks the same every time. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function addDemoData(b: BudgetData) {
  const rand = rng(42);
  const thisMonth = currentMonth();
  const start = addMonths(thisMonth, -3);
  const startDate = `${start}-01`;
  const t = today();
  b.createdAt = startDate;

  const cat = (n: string) => b.categories.find((c) => c.name === n)!;
  const payees = new Map<string, string>();
  const payee = (n: string) => {
    if (!payees.has(n)) {
      const id = uid('p');
      payees.set(n, id);
      b.payees.push({ id, name: n });
    }
    return payees.get(n)!;
  };

  const account = (name: string, type: AccountType, balance: number): Account => {
    const info = ACCOUNT_TYPE_INFO[type];
    const a: Account = { id: uid('a'), name, type, onBudget: info.onBudget, closed: false, sort: b.accounts.length };
    b.accounts.push(a);
    if (isCreditType(type)) {
      let g = b.groups.find((x) => x.isCreditCardPayments);
      if (!g) {
        g = { id: uid('g'), name: 'Credit Card Payments', hidden: false, sort: -1, isCreditCardPayments: true };
        b.groups.push(g);
      }
      b.categories.push({ id: uid('c'), groupId: g.id, name, hidden: false, sort: 0, linkedAccountId: a.id });
    }
    b.transactions.push({
      id: uid('t'),
      accountId: a.id,
      date: startDate,
      amount: toMilli(balance),
      payeeId: payee('Starting Balance'),
      categoryId: info.onBudget && !isCreditType(type) ? RTA : null,
      cleared: 'reconciled',
      approved: true,
      isStartingBalance: true,
    });
    return a;
  };

  const checking = account('Everyday Checking', 'checking', 2450);
  const savings = account('High-Yield Savings', 'savings', 6200);
  const visa = account('Visa Platinum', 'creditCard', -420);
  const wallet = account('Cash Wallet', 'cash', 120);
  account('Brokerage', 'asset', 15200);
  account('Car Loan', 'loan', -9800);

  const visaPay = b.categories.find((c) => c.linkedAccountId === visa.id)!;

  const targets: Record<string, Target> = {
    Rent: { kind: 'needed', cadence: 'monthly', behavior: 'setAside', amount: toMilli(1650), createdMonth: start },
    Electricity: { kind: 'needed', cadence: 'monthly', behavior: 'refill', amount: toMilli(110), createdMonth: start },
    Internet: { kind: 'needed', cadence: 'monthly', behavior: 'setAside', amount: toMilli(60), createdMonth: start },
    Phone: { kind: 'needed', cadence: 'monthly', behavior: 'setAside', amount: toMilli(45), createdMonth: start },
    Insurance: { kind: 'needed', cadence: 'yearly', amount: toMilli(1200), dueDate: addMonthsToDate(`${thisMonth}-15`, 5), createdMonth: start },
    Subscriptions: { kind: 'needed', cadence: 'monthly', behavior: 'refill', amount: toMilli(32), createdMonth: start },
    Groceries: { kind: 'needed', cadence: 'weekly', behavior: 'refill', weekday: 6, amount: toMilli(130), createdMonth: start },
    'Dining Out': { kind: 'needed', cadence: 'monthly', behavior: 'refill', amount: toMilli(220), createdMonth: start },
    Transportation: { kind: 'needed', cadence: 'monthly', behavior: 'refill', amount: toMilli(160), createdMonth: start },
    Vacation: { kind: 'balance', amount: toMilli(3000), dueDate: addMonthsToDate(`${thisMonth}-01`, 8), createdMonth: start },
    'Emergency Fund': { kind: 'balance', amount: toMilli(10000), createdMonth: start },
    'New Laptop': { kind: 'savings', amount: toMilli(100), createdMonth: start },
    Gifts: { kind: 'needed', cadence: 'custom', repeatMonths: 12, amount: toMilli(600), dueDate: `${thisMonth.slice(0, 4)}-12-15`, createdMonth: start },
  };
  for (const [n, target] of Object.entries(targets)) cat(n).target = target;
  cat('Rent').note = 'Due on the 1st. Landlord accepts bank transfer only.';

  const tx = (accountId: string, date: string, amount: number, payeeName: string | null, categoryId: string | null, memo?: string): Transaction => {
    const row: Transaction = {
      id: uid('t'),
      accountId,
      date,
      amount: toMilli(amount),
      payeeId: payeeName ? payee(payeeName) : null,
      categoryId,
      memo,
      cleared: date < addDays(t, -3) ? 'cleared' : 'uncleared',
      approved: true,
    };
    b.transactions.push(row);
    return row;
  };
  const transfer = (from: Account, to: Account, date: string, amount: number, memo?: string) => {
    const a = tx(from.id, date, -amount, null, null, memo);
    const c = tx(to.id, date, amount, null, null, memo);
    a.payeeId = c.payeeId = null;
    a.transferAccountId = to.id;
    a.transferTransactionId = c.id;
    c.transferAccountId = from.id;
    c.transferTransactionId = a.id;
  };

  const plan: Record<string, number> = {
    Rent: 1650,
    Electricity: 110,
    Internet: 60,
    Phone: 45,
    Insurance: 150,
    Subscriptions: 32,
    Groceries: 520,
    'Dining Out': 220,
    Transportation: 160,
    'Personal Care': 60,
    Entertainment: 90,
    Shopping: 150,
    Hobbies: 60,
    Vacation: 350,
    'Emergency Fund': 400,
    'New Laptop': 100,
    Gifts: 50,
  };

  const groceries = ['Whole Foods', 'Trader Joe’s', 'Farmers Market', 'Costco'];
  const dining = ['Blue Bottle Coffee', 'Sushi Den', 'Chipotle', 'Pizzeria Nonna', 'Thai Basil'];
  const shopping = ['Amazon', 'Uniqlo', 'IKEA', 'Target'];
  const fun = ['Netflix', 'AMC Theatres', 'Spotify Concert', 'Steam'];
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const amt = (min: number, max: number) => Math.round((min + rand() * (max - min)) * 100) / 100;

  for (const m of monthRange(start, thisMonth)) {
    const last = daysInMonth(m);
    const day = (d: number) => `${m}-${String(Math.min(d, last)).padStart(2, '0')}`;
    const inRange = (d: string) => d <= t;
    const isCurrent = m === thisMonth;

    // Income first so the budget can be funded.
    for (const d of [day(1), day(15)]) if (inRange(d)) tx(checking.id, d, 2840, 'Acme Corp Payroll', RTA, 'Paycheck');
    if (m !== start && inRange(day(20))) tx(savings.id, day(20), 18.4, 'Interest', RTA);

    // Assignments: past months are fully funded, the current month is partially funded.
    const row: Record<string, Milli> = (b.assigned[m] = {});
    for (const [n, v] of Object.entries(plan)) {
      if (isCurrent && ['Vacation', 'New Laptop', 'Gifts', 'Hobbies'].includes(n)) continue;
      row[cat(n).id] = toMilli(isCurrent && n === 'Groceries' ? 400 : v);
    }
    if (m === start) row[visaPay.id] = toMilli(420);

    const spend: [string, string, number, string, string, string?][] = [
      [checking.id, day(1), 1650, 'Parkview Apartments', 'Rent'],
      [checking.id, day(6), amt(85, 128), 'City Power & Light', 'Electricity'],
      [visa.id, day(9), 60, 'Fiber Net', 'Internet'],
      [visa.id, day(12), 45, 'T-Mobile', 'Phone'],
      [visa.id, day(3), 15.49, 'Netflix', 'Subscriptions'],
      [visa.id, day(17), 11.99, 'Spotify', 'Subscriptions'],
      [checking.id, day(22), amt(30, 60), 'Shell', 'Transportation'],
      [visa.id, day(8), amt(25, 45), 'Uber', 'Transportation'],
      [checking.id, day(14), amt(40, 70), 'Metro Card', 'Transportation'],
      [visa.id, day(19), amt(25, 60), 'Sephora', 'Personal Care'],
      [visa.id, day(24), amt(20, 80), pick(fun), 'Entertainment'],
      [visa.id, day(11), amt(30, 120), pick(shopping), 'Shopping'],
      [checking.id, day(26), amt(15, 55), 'Michaels', 'Hobbies'],
    ];
    for (const w of [2, 9, 16, 23, 30]) spend.push([w % 2 ? visa.id : checking.id, day(w), amt(70, 135), pick(groceries), 'Groceries']);
    for (const w of [4, 10, 13, 18, 25, 28]) spend.push([w % 3 ? visa.id : wallet.id, day(w), amt(8, 48), pick(dining), 'Dining Out']);
    if (m === addMonths(thisMonth, -1)) spend.push([visa.id, day(21), 189.0, 'Delta Air Lines', 'Vacation', 'Flight deposit']);

    for (const [acct, d, a, p, c, memo] of spend) if (inRange(d)) tx(acct, d, -a, p, cat(c).id, memo);

    // Pay off the card each month from checking and move savings.
    if (inRange(day(27))) {
      const owed = -b.transactions.filter((x) => x.accountId === visa.id && x.date <= day(26)).reduce((s, x) => s + x.amount, 0) / 1000;
      if (owed > 0) transfer(checking, visa, day(27), Math.round(owed * 100) / 100, 'Card payment');
    }
    if (inRange(day(16))) transfer(checking, savings, day(16), 400, 'Emergency fund');
  }

  // A couple of recent unapproved imports + flags for flavour.
  const recent = b.transactions.filter((x) => x.date >= addDays(t, -4) && x.date <= t && x.amount < 0 && !x.transferAccountId);
  recent.slice(0, 2).forEach((x) => (x.approved = false));
  const flagged = b.transactions.find((x) => x.payeeId === payee('Delta Air Lines'));
  if (flagged) flagged.flag = 'blue';

  // Payee memory for auto-categorisation.
  for (const p of b.payees) {
    const latest = b.transactions.filter((x) => x.payeeId === p.id && x.categoryId).sort((a, c) => (a.date < c.date ? 1 : -1))[0];
    if (latest) p.lastCategoryId = latest.categoryId;
  }

  // Scheduled transactions.
  const nextFirst = `${addMonths(thisMonth, 1)}-01`;
  const nextOn = (d: number) => {
    const here = `${thisMonth}-${String(d).padStart(2, '0')}`;
    return t < here ? here : `${addMonths(thisMonth, 1)}-${String(d).padStart(2, '0')}`;
  };
  b.scheduled.push(
    { id: uid('sc'), accountId: checking.id, nextDate: nextOn(15) < nextFirst ? nextOn(15) : nextFirst, frequency: 'twiceAMonth', amount: toMilli(2840), payeeId: payee('Acme Corp Payroll'), categoryId: RTA, memo: 'Paycheck' },
    { id: uid('sc'), accountId: checking.id, nextDate: nextFirst, frequency: 'monthly', amount: toMilli(-1650), payeeId: payee('Parkview Apartments'), categoryId: cat('Rent').id },
    { id: uid('sc'), accountId: visa.id, nextDate: addMonthsToDate(`${thisMonth}-03`, 1), frequency: 'monthly', amount: toMilli(-15.49), payeeId: payee('Netflix'), categoryId: cat('Subscriptions').id },
    { id: uid('sc'), accountId: checking.id, nextDate: nextOn(16), frequency: 'monthly', amount: toMilli(-400), payeeId: null, categoryId: null, transferAccountId: savings.id, memo: 'Emergency fund' },
  );
  // Keep the card payment category whole, then park leftover money in the Emergency Fund
  // so the demo opens with a small, realistic Ready to Assign.
  for (const m of monthRange(start, thisMonth)) {
    const avail = computeBudget(b).months[m]?.categories[visaPay.id]?.available ?? 0;
    if (avail < 0) b.assigned[m][visaPay.id] = (b.assigned[m][visaPay.id] ?? 0) - avail;
  }
  for (const m of monthRange(start, thisMonth)) {
    const spare = computeBudget(b).months[m].readyToAssign - (m === thisMonth ? toMilli(486.2) : 0);
    const id = cat('Emergency Fund').id;
    if (spare > 0) b.assigned[m][id] = (b.assigned[m][id] ?? 0) + spare;
  }

  b.settings.pinnedCategoryIds = [cat('Dining Out').id, cat('Transportation').id, cat('Shopping').id];
  b.settings.currentGoalId = cat('Vacation').id;

  b.payees.sort((a, c) => a.name.localeCompare(c.name));
  b.categories.sort((a: Category, c: Category) => a.sort - c.sort);
}
