import { daysBetween } from '@/utils/date';
import { isCreditType } from '@/utils/icons';
import { RTA, type BudgetData, type Milli } from '@/store/types';

export interface AccountBalance {
  cleared: Milli;
  uncleared: Milli;
  working: Milli;
}

export function accountBalances(data: BudgetData): Record<string, AccountBalance> {
  const out: Record<string, AccountBalance> = {};
  for (const a of data.accounts) out[a.id] = { cleared: 0, uncleared: 0, working: 0 };
  for (const tx of data.transactions) {
    const b = out[tx.accountId];
    if (!b) continue;
    if (tx.cleared === 'uncleared') b.uncleared += tx.amount;
    else b.cleared += tx.amount;
    b.working += tx.amount;
  }
  return out;
}

/**
 * Age of Money: how many days old the money is when you spend it.
 * Inflows form a FIFO queue; each outflow from a cash (non-credit, on-budget) account consumes the oldest money.
 * The result is the average age of the last 10 outflows.
 */
export function ageOfMoney(data: BudgetData): number | null {
  const accounts = new Map(data.accounts.map((a) => [a.id, a]));
  const cashAccount = (id?: string) => {
    const a = id ? accounts.get(id) : undefined;
    return !!a && a.onBudget && !isCreditType(a.type);
  };
  const events = data.transactions
    .filter((t) => cashAccount(t.accountId) && !(t.transferAccountId && cashAccount(t.transferAccountId)))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.amount - a.amount));

  const queue: { date: string; amount: Milli }[] = [];
  let head = 0;
  const ages: number[] = [];
  for (const tx of events) {
    const isIncome = tx.amount > 0 && (tx.categoryId === RTA || tx.isStartingBalance || tx.subtransactions?.some((s) => s.categoryId === RTA));
    if (tx.amount > 0) {
      if (isIncome) queue.push({ date: tx.date, amount: tx.amount });
      continue;
    }
    let remaining = -tx.amount;
    let weighted = 0;
    let spent = 0;
    while (remaining > 0 && head < queue.length) {
      const bucket = queue[head];
      const take = Math.min(bucket.amount, remaining);
      weighted += take * daysBetween(bucket.date, tx.date);
      spent += take;
      bucket.amount -= take;
      remaining -= take;
      if (bucket.amount === 0) head++;
    }
    if (spent > 0) ages.push(weighted / spent);
  }
  if (ages.length === 0) return null;
  const recent = ages.slice(-10);
  return Math.max(0, Math.round(recent.reduce((s, a) => s + a, 0) / recent.length));
}
