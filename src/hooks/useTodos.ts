import { useMemo } from 'react';
import { categoryMonth, type MonthBudget } from '@/engine/budget';
import { useBudgetData } from '@/store/store';
import { currentMonth } from '@/utils/date';
import { formatMoney } from '@/utils/money';
import { useMonthBudget } from './useBudget';

export type TodoKind = 'overspent' | 'assign' | 'overassigned' | 'approve' | 'categorize';

export interface Todo {
  kind: TodoKind;
  count: number;
  label: string;
  action: string;
  /** Most affected category (for one-tap cover) */
  categoryId?: string;
  /** Every affected category, most affected first (Cover asks which to fix when there are several) */
  categoryIds?: string[];
}

/** Things that need the user's attention this month, shown as a checklist on Home. */
export function useTodos(): Todo[] {
  const data = useBudgetData();
  const month = currentMonth();
  const mb = useMonthBudget(month);
  return useMemo(() => {
    if (!data || !mb) return [];
    const out: Todo[] = [];
    const visible = data.categories.filter((c) => !c.hidden && !data.groups.find((g) => g.id === c.groupId)?.hidden);
    const overspent = visible.filter((c) => categoryMonth(mb, c.id).available < 0);
    if (overspent.length) {
      const ids = overspent.map((c) => c.id).sort((a, b) => categoryMonth(mb, a).available - categoryMonth(mb, b).available);
      out.push({ kind: 'overspent', count: overspent.length, label: overspent.length === 1 ? 'Overspent category' : 'Overspent categories', action: 'Cover', categoryId: mostOverspent(ids, mb), categoryIds: ids });
    }
    if (mb.readyToAssign > 0) out.push({ kind: 'assign', count: 1, label: `${formatMoney(mb.readyToAssign)} ready to assign`, action: 'Assign' });
    if (mb.readyToAssign < 0) out.push({ kind: 'overassigned', count: 1, label: `Assigned ${formatMoney(-mb.readyToAssign)} too much`, action: 'Fix' });

    const onBudget = new Set(data.accounts.filter((a) => a.onBudget).map((a) => a.id));
    const unapproved = data.transactions.filter((t) => !t.approved).length;
    if (unapproved) out.push({ kind: 'approve', count: unapproved, label: unapproved === 1 ? 'Transaction to approve' : 'Transactions to approve', action: 'Review' });
    const uncategorized = data.transactions.filter(
      (t) => onBudget.has(t.accountId) && !t.categoryId && !t.subtransactions?.length && !t.isStartingBalance && !(t.transferAccountId && onBudget.has(t.transferAccountId)),
    ).length;
    if (uncategorized) out.push({ kind: 'categorize', count: uncategorized, label: uncategorized === 1 ? 'Transaction needs a category' : 'Transactions need a category', action: 'Categorize' });
    return out;
  }, [data, mb]);
}

/** The category that's overspent by the most, covered first. */
export function mostOverspent(ids: string[], mb: MonthBudget): string | undefined {
  return ids.reduce<string | undefined>((best, id) => (best === undefined || categoryMonth(mb, id).available < categoryMonth(mb, best).available ? id : best), undefined);
}
