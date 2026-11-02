import { addMonths } from '@/utils/date';
import type { BudgetData, Milli, MonthKey } from '@/store/types';
import { categoryMonth, type BudgetResult, getMonth } from './budget';

export type AutoAssignStrategy =
  | 'underfunded'
  | 'assignedLastMonth'
  | 'spentLastMonth'
  | 'averageAssigned'
  | 'averageSpent'
  | 'reduceOverfunding'
  | 'resetAvailable'
  | 'resetAssigned';

export const AUTO_ASSIGN_OPTIONS: { value: AutoAssignStrategy; label: string; hint: string }[] = [
  { value: 'underfunded', label: 'Underfunded', hint: 'Fund every target for this month' },
  { value: 'assignedLastMonth', label: 'Assigned last month', hint: 'Repeat last month’s plan' },
  { value: 'spentLastMonth', label: 'Spent last month', hint: 'Assign what you spent last month' },
  { value: 'averageAssigned', label: 'Average assigned', hint: '3-month average of assigned' },
  { value: 'averageSpent', label: 'Average spent', hint: '3-month average of spending' },
  { value: 'reduceOverfunding', label: 'Reduce overfunding', hint: 'Pull back anything above its target' },
  { value: 'resetAvailable', label: 'Reset available amounts', hint: 'Bring available to zero' },
  { value: 'resetAssigned', label: 'Reset assigned amounts', hint: 'Clear this month’s assigned' },
];

/**
 * When there isn't enough to fund everything: spreads `amount` over what's short, covering overspending first,
 * then underfunded targets in list order, until the money runs out. Returns only the categories that change.
 */
export function assignUpTo(result: BudgetResult, month: MonthKey, categoryIds: string[], amount: Milli): Record<string, Milli> {
  const cur = getMonth(result, month);
  const out: Record<string, Milli> = {};
  let left = Math.max(amount, 0);
  const give = (id: string, want: Milli) => {
    const take = Math.min(Math.max(want, 0), left);
    if (take <= 0) return;
    out[id] = (out[id] ?? categoryMonth(cur, id).assigned) + take;
    left -= take;
  };
  for (const id of categoryIds) give(id, -categoryMonth(cur, id).available);
  for (const id of categoryIds) {
    const cm = categoryMonth(cur, id);
    // Covering overspending above already counts toward the target (both raise what's assigned).
    if (cm.target && !cm.target.snoozed) give(id, cm.target.underfunded - ((out[id] ?? cm.assigned) - cm.assigned));
  }
  return out;
}

/**
 * Computes new assigned values for `categoryIds` in `month`.
 * Returns only the categories whose assigned value changes.
 */
export function autoAssign(
  data: BudgetData,
  result: BudgetResult,
  month: MonthKey,
  strategy: AutoAssignStrategy,
  categoryIds: string[],
): Record<string, Milli> {
  const cur = getMonth(result, month);
  const prevMonths = [1, 2, 3].map((n) => getMonth(result, addMonths(month, -n)));
  const out: Record<string, Milli> = {};
  for (const id of categoryIds) {
    const cm = categoryMonth(cur, id);
    let next = cm.assigned;
    switch (strategy) {
      case 'underfunded':
        next = cm.assigned + (cm.target?.underfunded ?? 0);
        break;
      case 'assignedLastMonth':
        next = categoryMonth(prevMonths[0], id).assigned;
        break;
      case 'spentLastMonth':
        next = Math.max(0, -categoryMonth(prevMonths[0], id).activity);
        break;
      case 'averageAssigned':
        next = Math.round(prevMonths.reduce((s, m) => s + categoryMonth(m, id).assigned, 0) / 3);
        break;
      case 'averageSpent':
        next = Math.max(0, Math.round(-prevMonths.reduce((s, m) => s + categoryMonth(m, id).activity, 0) / 3));
        break;
      case 'reduceOverfunding': {
        const t = cm.target;
        if (t && t.neededThisMonth >= 0 && t.underfunded === 0) {
          const over = cm.assigned - t.neededThisMonth;
          if (over > 0) next = cm.assigned - Math.min(over, Math.max(cm.available, 0));
        }
        break;
      }
      case 'resetAvailable':
        next = cm.assigned - cm.available;
        break;
      case 'resetAssigned':
        next = 0;
        break;
    }
    if (next !== cm.assigned) out[id] = next;
  }
  // Avoid touching categories that don't exist anymore.
  const valid = new Set(data.categories.map((c) => c.id));
  for (const id of Object.keys(out)) if (!valid.has(id)) delete out[id];
  return out;
}
