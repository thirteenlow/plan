import type { BudgetData, ISODate, MonthKey, Transaction } from '@/store/types';
import { addMonths, daysInMonth, monthDiff, monthOf } from '@/utils/date';

/** Every transaction for one category or one payee: what the History screen lists. */
export type HistoryOf = { categoryId: string } | { payeeId: string };

/** A transaction in a history, with the part that counts (a split counts only its lines for the category). */
export interface HistoryItem {
  tx: Transaction;
  amount: number;
}

export type HistoryRange = 'month' | '3m' | '12m' | 'all' | 'custom';

/** The dates a history covers, both inclusive; left out: no limit that side. */
export interface HistoryPeriod {
  from?: ISODate;
  to?: ISODate;
}

/** The period for a range ending this month (`now`); `month` for 'month', `custom` for 'custom'. */
export function periodFor(range: HistoryRange, now: MonthKey, month?: MonthKey, custom?: HistoryPeriod): HistoryPeriod {
  const whole = (m: MonthKey) => ({ from: `${m}-01`, to: `${m}-${String(daysInMonth(m)).padStart(2, '0')}` });
  if (range === 'month') return whole(month ?? now);
  if (range === '3m') return { from: `${addMonths(now, -2)}-01` };
  if (range === '12m') return { from: `${addMonths(now, -11)}-01` };
  if (range === 'custom') return custom ?? {};
  return {};
}

export interface HistorySummary {
  /** Money out, as a positive number */
  spent: number;
  /** Money in (refunds, income) */
  received: number;
  count: number;
  /** Money out per month, from the range's start or the first transaction in it, whichever is later */
  perMonth: number;
  months: number;
  /** Category: the payees with the most money out. Payee: the categories it's filed under most. */
  top: { id: string; amount: number }[];
  /** Each month with transactions, newest first, with the month's net amount */
  byMonth: { month: MonthKey; net: number; items: HistoryItem[] }[];
}

const newestFirst = (a: Transaction, b: Transaction) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id));

export function historyItems(data: BudgetData, of: HistoryOf): HistoryItem[] {
  const out: HistoryItem[] = [];
  for (const t of data.transactions) {
    if (t.isStartingBalance) continue;
    if ('categoryId' in of) {
      if (t.categoryId === of.categoryId && !t.subtransactions?.length) out.push({ tx: t, amount: t.amount });
      else {
        const part = t.subtransactions?.filter((s) => s.categoryId === of.categoryId).reduce((sum, s) => sum + s.amount, 0);
        if (part) out.push({ tx: t, amount: part });
      }
    } else if (t.payeeId === of.payeeId && !t.transferAccountId) out.push({ tx: t, amount: t.amount });
  }
  return out.sort((a, b) => newestFirst(a.tx, b.tx));
}

/** Totals and month groups for the items in a period (`now`: the current month, where an open period ends). */
export function historySummary(items: HistoryItem[], of: HistoryOf, period: HistoryPeriod, now: MonthKey): HistorySummary {
  const shown = items.filter((i) => (!period.from || i.tx.date >= period.from) && (!period.to || i.tx.date <= period.to));
  const from = period.from ? monthOf(period.from) : null;
  let spent = 0;
  let received = 0;
  const top = new Map<string, number>();
  const groups = new Map<MonthKey, { month: MonthKey; net: number; items: HistoryItem[] }>();
  for (const i of shown) {
    if (i.amount < 0) spent -= i.amount;
    else received += i.amount;
    const key = 'categoryId' in of ? i.tx.payeeId : i.tx.subtransactions?.length ? null : i.tx.categoryId;
    if (key && i.amount < 0) top.set(key, (top.get(key) ?? 0) - i.amount);
    const m = monthOf(i.tx.date);
    const g = groups.get(m) ?? { month: m, net: 0, items: [] };
    g.net += i.amount;
    g.items.push(i);
    groups.set(m, g);
  }
  const end = period.to && monthOf(period.to) < now ? monthOf(period.to) : now;
  const oldest = shown.length ? monthOf(shown[shown.length - 1].tx.date) : end;
  // Averaged over the months there's been spending in the period, not the whole period for something new.
  const start = from && from > oldest ? from : oldest;
  const months = Math.max(1, monthDiff(start, end) + 1);
  return {
    spent,
    received,
    count: shown.length,
    perMonth: Math.round(spent / months),
    months,
    top: [...top.entries()].map(([id, amount]) => ({ id, amount })).sort((a, b) => b.amount - a.amount).slice(0, 3),
    byMonth: [...groups.values()],
  };
}
