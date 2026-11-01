import { addMonths, monthOf, monthRange } from '@/utils/date';
import { ACCOUNT_TYPE_INFO, isCreditType } from '@/utils/icons';
import { RTA, type BudgetData, type Milli, type MonthKey } from '@/store/types';

interface Line {
  month: MonthKey;
  date: string;
  categoryId: string | null;
  amount: Milli;
  payeeId: string | null;
  starting: boolean;
}

/** Flattens budget-affecting transactions into category lines (splits expanded, on-budget transfers removed). */
function budgetLines(data: BudgetData): Line[] {
  const acc = new Map(data.accounts.map((a) => [a.id, a]));
  const out: Line[] = [];
  for (const tx of data.transactions) {
    const a = acc.get(tx.accountId);
    if (!a?.onBudget) continue;
    if (tx.transferAccountId && acc.get(tx.transferAccountId)?.onBudget) continue;
    const month = monthOf(tx.date);
    const entries = tx.subtransactions?.length ? tx.subtransactions : [{ categoryId: tx.categoryId, amount: tx.amount }];
    for (const e of entries) out.push({ month, date: tx.date, categoryId: e.categoryId, amount: e.amount, payeeId: tx.payeeId, starting: !!tx.isStartingBalance });
  }
  return out;
}

export interface SpendingSlice {
  id: string;
  name: string;
  amount: Milli; // positive = spent
}

export function spendingByCategory(data: BudgetData, from: MonthKey, to: MonthKey, by: 'category' | 'group' | 'payee') {
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const groups = new Map(data.groups.map((g) => [g.id, g]));
  const payees = new Map(data.payees.map((p) => [p.id, p]));
  const totals = new Map<string, SpendingSlice>();
  for (const l of budgetLines(data)) {
    if (l.month < from || l.month > to || l.starting || !l.categoryId || l.categoryId === RTA) continue;
    const cat = cats.get(l.categoryId);
    if (!cat || cat.linkedAccountId) continue;
    let id: string;
    let name: string;
    if (by === 'category') {
      id = cat.id;
      name = cat.name;
    } else if (by === 'group') {
      id = cat.groupId;
      name = groups.get(cat.groupId)?.name ?? 'Other';
    } else {
      id = l.payeeId ?? 'none';
      name = (l.payeeId && payees.get(l.payeeId)?.name) || 'No payee';
    }
    const cur = totals.get(id) ?? { id, name, amount: 0 };
    cur.amount -= l.amount;
    totals.set(id, cur);
  }
  return [...totals.values()].filter((s) => s.amount > 0).sort((a, b) => b.amount - a.amount);
}

/** Spending per day of `month` (index 0 = the 1st), counted the same way as spendingByCategory. */
export function dailySpending(data: BudgetData, month: MonthKey, days: number): Milli[] {
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const out = Array.from({ length: days }, () => 0);
  for (const l of budgetLines(data)) {
    if (l.month !== month || l.starting || !l.categoryId || l.categoryId === RTA) continue;
    const cat = cats.get(l.categoryId);
    if (!cat || cat.linkedAccountId) continue;
    const d = Number(l.date.slice(8, 10)) - 1;
    if (d >= 0 && d < days) out[d] -= l.amount;
  }
  return out;
}

export interface MonthlyTotals {
  month: MonthKey;
  income: Milli;
  spending: Milli;
}

export function incomeVsExpense(data: BudgetData, from: MonthKey, to: MonthKey): MonthlyTotals[] {
  const map = new Map<MonthKey, MonthlyTotals>(monthRange(from, to).map((m) => [m, { month: m, income: 0, spending: 0 }]));
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  for (const l of budgetLines(data)) {
    const row = map.get(l.month);
    if (!row) continue;
    // Starting balances count as income: that money arrived in the budget when you began.
    if (l.categoryId === RTA) row.income += l.amount;
    else if (l.starting) continue;
    else if (l.categoryId && cats.get(l.categoryId)?.linkedAccountId) continue;
    else row.spending -= l.amount;
  }
  return [...map.values()];
}

export interface NetWorthPoint {
  month: MonthKey;
  assets: Milli;
  debts: Milli; // positive number
  netWorth: Milli;
}

export function netWorthSeries(data: BudgetData, from: MonthKey, to: MonthKey): NetWorthPoint[] {
  const balances = new Map<string, Milli>();
  const sorted = [...data.transactions].sort((a, b) => (a.date < b.date ? -1 : 1));
  const types = new Map(data.accounts.map((a) => [a.id, a.type]));
  const out: NetWorthPoint[] = [];
  let i = 0;
  for (const m of monthRange(from, to)) {
    const end = addMonths(m, 1);
    while (i < sorted.length && monthOf(sorted[i].date) < end) {
      const t = sorted[i++];
      balances.set(t.accountId, (balances.get(t.accountId) ?? 0) + t.amount);
    }
    let assets = 0;
    let debts = 0;
    for (const [id, bal] of balances) {
      const type = types.get(id);
      if (!type) continue;
      const debtAccount = ACCOUNT_TYPE_INFO[type].debt || isCreditType(type);
      if (bal >= 0 && !debtAccount) assets += bal;
      else if (bal < 0) debts += -bal;
      else assets += bal;
    }
    out.push({ month: m, assets, debts, netWorth: assets - debts });
  }
  return out;
}

export function earliestMonth(data: BudgetData): MonthKey {
  let m = monthOf(data.createdAt);
  for (const t of data.transactions) if (monthOf(t.date) < m) m = monthOf(t.date);
  return m;
}
