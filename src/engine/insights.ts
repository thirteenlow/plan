/**
 * Numbers behind the Reflect screen: how a month went, how spending is pacing, what changed compared with
 * usual, and how safe the budget is (buffer, targets, card debt). Pure functions over the budget data.
 */
import { categoryMonth, computeBudget, getMonth } from '@/engine/budget';
import { accountBalances } from '@/engine/accounts';
import { dailySpending, earliestMonth, incomeVsExpense, spendingByCategory } from '@/engine/reports';
import { RTA, type BudgetData, type Milli, type MonthKey } from '@/store/types';
import { addMonths, daysInMonth } from '@/utils/date';
import { isCreditType } from '@/utils/icons';

/** Earlier months to compare against ("usual"): up to 3, never before the budget's first month. */
function priorMonths(data: BudgetData, month: MonthKey, n = 3): MonthKey[] {
  const first = earliestMonth(data);
  const out: MonthKey[] = [];
  for (let i = 1; i <= n; i++) {
    const m = addMonths(month, -i);
    if (m >= first) out.push(m);
  }
  return out;
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

export interface MonthSnapshot {
  income: Milli;
  spending: Milli;
  saved: Milli;
  /** Share of income kept (0..1, can be negative); null without income */
  savingsRate: number | null;
  /** Average spending over the previous (up to) 3 months; null when there are none */
  usualSpending: Milli | null;
}

export function monthSnapshot(data: BudgetData, month: MonthKey): MonthSnapshot {
  const prior = priorMonths(data, month);
  const rows = incomeVsExpense(data, prior.length ? prior[prior.length - 1] : month, month);
  const cur = rows[rows.length - 1] ?? { income: 0, spending: 0 };
  const before = rows.slice(0, -1).filter((r) => r.spending > 0);
  const saved = cur.income - cur.spending;
  return { income: cur.income, spending: cur.spending, saved, savingsRate: cur.income > 0 ? saved / cur.income : null, usualSpending: mean(before.map((r) => r.spending)) };
}

export interface SpendingPace {
  days: number;
  /** Cumulative spending per day this month, up to `today` for the current month */
  current: Milli[];
  /** Cumulative spending per day last month (whole month) */
  previous: Milli[];
  spentSoFar: Milli;
  /** Same day last month, for a fair comparison */
  previousSoFar: Milli;
  /** Projected month total at the current daily rate (current month only) */
  projected: Milli | null;
  previousTotal: Milli;
}

const cumulative = (xs: Milli[]) => xs.reduce<Milli[]>((acc, x) => [...acc, (acc[acc.length - 1] ?? 0) + x], []);

export function spendingPace(data: BudgetData, month: MonthKey, todayISO: string): SpendingPace {
  const days = daysInMonth(month);
  const isCurrent = todayISO.slice(0, 7) === month;
  const dayNow = isCurrent ? Number(todayISO.slice(8, 10)) : days;
  const current = cumulative(dailySpending(data, month, days)).slice(0, dayNow);
  const prevMonth = addMonths(month, -1);
  const previous = cumulative(dailySpending(data, prevMonth, daysInMonth(prevMonth)));
  const spentSoFar = current[current.length - 1] ?? 0;
  return {
    days,
    current,
    previous,
    spentSoFar,
    previousSoFar: previous[Math.min(dayNow, previous.length) - 1] ?? 0,
    projected: isCurrent && dayNow > 0 ? Math.round((spentSoFar / dayNow) * days) : null,
    previousTotal: previous[previous.length - 1] ?? 0,
  };
}

export interface BreakdownRow {
  id: string;
  name: string;
  amount: Milli;
  /** Average for this row over the previous months; null when there's no history */
  usual: Milli | null;
}

/** Spending this month by category, group or payee, each with its usual amount. */
export function breakdown(data: BudgetData, month: MonthKey, by: 'category' | 'group' | 'payee'): BreakdownRow[] {
  const prior = priorMonths(data, month);
  const history = prior.map((m) => new Map(spendingByCategory(data, m, m, by).map((s) => [s.id, s.amount])));
  return spendingByCategory(data, month, month, by).map((s) => ({ ...s, usual: history.length ? mean(history.map((h) => h.get(s.id) ?? 0)) : null }));
}

export type InsightTone = 'good' | 'warn' | 'neutral';
export interface Insight {
  icon: 'trending-up' | 'trending-down' | 'receipt-outline' | 'alert-circle-outline' | 'sparkles-outline';
  tone: InsightTone;
  /** Short subject, e.g. a category name */
  label: string;
  /** A few words of context, e.g. "above usual" */
  note: string;
  /** The figure, e.g. "+40%" or "$538" */
  value: string;
}

/** A few short observations about the month, most useful first. */
export function insights(data: BudgetData, month: MonthKey, fmt: (m: Milli) => string): Insight[] {
  const out: Insight[] = [];
  const rows = breakdown(data, month, 'category').filter((r) => r.usual !== null);
  const changes = rows.map((r) => ({ ...r, diff: r.amount - (r.usual ?? 0) })).filter((r) => (r.usual ?? 0) > 0);
  const up = changes.filter((r) => r.diff >= 10_000 && r.diff / (r.usual || 1) >= 0.2).sort((a, b) => b.diff - a.diff)[0];
  if (up) out.push({ icon: 'trending-up', tone: 'warn', label: up.name, note: 'above usual', value: `+${Math.round((up.diff / (up.usual || 1)) * 100)}%` });
  // Categories spent less than usual (including ones not spent at all this month).
  const thisMonth = new Map(rows.map((r) => [r.id, r.amount]));
  const lastMonth = breakdown(data, addMonths(month, -1), 'category');
  const downs = [...changes.filter((r) => r.diff < 0), ...lastMonth.filter((r) => !thisMonth.has(r.id) && r.amount > 0).map((r) => ({ ...r, diff: -r.amount }))];
  const down = downs.sort((a, b) => a.diff - b.diff)[0];
  if (down && -down.diff >= 10_000) out.push({ icon: 'trending-down', tone: 'good', label: down.name, note: 'below usual', value: `−${fmt(-down.diff)}` });

  const mb = getMonth(computeBudget(data, month), month);
  if (mb.overspentCount > 0) out.push({ icon: 'alert-circle-outline', tone: 'warn', label: 'Overspent', note: mb.overspentCount === 1 ? 'category' : 'categories', value: String(mb.overspentCount) });

  const snap = monthSnapshot(data, month);
  if (snap.savingsRate !== null && snap.savingsRate >= 0.1) out.push({ icon: 'sparkles-outline', tone: 'good', label: 'Kept', note: 'of income', value: `${Math.round(snap.savingsRate * 100)}%` });

  const big = biggestPurchase(data, month);
  if (big) out.push({ icon: 'receipt-outline', tone: 'neutral', label: big.name, note: 'biggest purchase', value: fmt(big.amount) });
  return out.slice(0, 4);
}

export function biggestPurchase(data: BudgetData, month: MonthKey): { name: string; amount: Milli } | null {
  const onBudget = new Set(data.accounts.filter((a) => a.onBudget).map((a) => a.id));
  const linked = new Set(data.categories.filter((c) => c.linkedAccountId).map((c) => c.id));
  let best: { name: string; amount: Milli } | null = null;
  for (const t of data.transactions) {
    if (!t.date.startsWith(month) || !onBudget.has(t.accountId) || t.transferAccountId || t.isStartingBalance || t.amount >= 0) continue;
    if (!t.subtransactions?.length && (!t.categoryId || t.categoryId === RTA || linked.has(t.categoryId))) continue;
    if (!best || -t.amount > best.amount) {
      const payee = t.payeeId ? data.payees.find((p) => p.id === t.payeeId)?.name : undefined;
      const cat = t.categoryId ? data.categories.find((c) => c.id === t.categoryId)?.name : undefined;
      best = { name: payee || cat || 'A purchase', amount: -t.amount };
    }
  }
  return best;
}

export interface Health {
  /** Money in budget cash accounts (checking, savings, cash) */
  cash: Milli;
  /** Months of usual spending that cash would cover; null without spending history */
  bufferMonths: number | null;
  targetsTotal: number;
  targetsFunded: number;
  /** Still to assign to hit this month's targets */
  targetsShort: Milli;
  cardDebt: Milli;
  /** Card debt not yet covered by the cards' payment categories */
  cardUncovered: Milli;
}

export function budgetHealth(data: BudgetData, month: MonthKey): Health {
  const balances = accountBalances(data);
  const open = data.accounts.filter((a) => a.onBudget && !a.closed);
  const cash = open.filter((a) => !isCreditType(a.type)).reduce((s, a) => s + (balances[a.id]?.working ?? 0), 0);
  const prior = priorMonths(data, month);
  // Usual monthly spending: the previous months, or this month when there's no history yet.
  const rows = incomeVsExpense(data, prior.length ? prior[prior.length - 1] : month, month);
  const before = rows.slice(0, -1).map((r) => r.spending).filter((x) => x > 0);
  const usual = mean(before.length ? before : rows.slice(-1).map((r) => r.spending).filter((x) => x > 0));
  const mb = getMonth(computeBudget(data, month), month);
  const withTargets = data.categories.filter((c) => c.target && !c.hidden).map((c) => categoryMonth(mb, c.id).target).filter((t) => t && !t.snoozed);
  let cardDebt = 0;
  let cardUncovered = 0;
  for (const a of open.filter((x) => isCreditType(x.type))) {
    const debt = Math.max(0, -(balances[a.id]?.working ?? 0));
    const pay = data.categories.find((c) => c.linkedAccountId === a.id);
    const covered = pay ? Math.max(0, categoryMonth(mb, pay.id).available) : 0;
    cardDebt += debt;
    cardUncovered += Math.max(0, debt - covered);
  }
  return {
    cash,
    bufferMonths: usual ? Math.max(0, cash) / usual : null,
    targetsTotal: withTargets.length,
    targetsFunded: withTargets.filter((t) => t!.funded).length,
    targetsShort: mb.underfunded,
    cardDebt,
    cardUncovered,
  };
}
