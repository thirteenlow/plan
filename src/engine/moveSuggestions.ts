import { RTA, type BudgetData, type Milli } from '@/store/types';
import { categoryMonth, type MonthBudget } from './budget';

export interface MoneyNeed {
  id: string;
  /** How much it takes to cover overspending and fund the target this month */
  amount: Milli;
  overspent: boolean;
}

export interface MoneySpare {
  /** A category id, or RTA */
  id: string;
  amount: Milli;
  /** Why it's spare: unassigned money, a category without a target, or assigned above its target */
  kind: 'unassigned' | 'noTarget' | 'overfunded';
}

export interface MoveSuggestion {
  from: string;
  to: string;
  amount: Milli;
}

/**
 * Where money is short this month and where there's some to spare, plus a plan that moves the spare money to the
 * shortfalls: Ready to Assign first, then categories without a target, then anything above its target. Overspent
 * categories are covered before underfunded targets, and credit card payment categories are never taken from.
 */
export function moneyPlan(data: BudgetData, mb: MonthBudget) {
  const groups = new Map(data.groups.map((g) => [g.id, g]));
  const live = data.categories.filter((c) => !c.hidden && !groups.get(c.groupId)?.hidden);

  const needs: MoneyNeed[] = [];
  const spares: MoneySpare[] = [];
  if (mb.readyToAssign > 0) spares.push({ id: RTA, amount: mb.readyToAssign, kind: 'unassigned' });
  for (const c of live) {
    const cm = categoryMonth(mb, c.id);
    const t = cm.target && !cm.target.snoozed ? cm.target : undefined;
    const need = Math.max(-cm.available, t?.underfunded ?? 0, 0);
    if (need > 0) {
      needs.push({ id: c.id, amount: need, overspent: cm.available < 0 });
      continue;
    }
    if (cm.available <= 0 || groups.get(c.groupId)?.isCreditCardPayments) continue;
    if (!t) spares.push({ id: c.id, amount: cm.available, kind: 'noTarget' });
    else {
      const over = Math.min(cm.assigned - t.neededThisMonth, cm.available);
      if (over > 0) spares.push({ id: c.id, amount: over, kind: 'overfunded' });
    }
  }
  needs.sort((a, b) => Number(b.overspent) - Number(a.overspent) || b.amount - a.amount);
  const order = { unassigned: 0, noTarget: 1, overfunded: 2 };
  spares.sort((a, b) => order[a.kind] - order[b.kind] || b.amount - a.amount);

  const suggestions: MoveSuggestion[] = [];
  const left = spares.map((s) => s.amount);
  for (const need of needs) {
    let still = need.amount;
    for (let i = 0; i < spares.length && still > 0; i++) {
      const take = Math.min(still, left[i]);
      if (take <= 0) continue;
      suggestions.push({ from: spares[i].id, to: need.id, amount: take });
      left[i] -= take;
      still -= take;
    }
  }

  const sum = (xs: { amount: Milli }[]) => xs.reduce((s, x) => s + x.amount, 0);
  return { needs, spares, suggestions, totalNeeded: sum(needs), totalSpare: sum(spares) };
}
