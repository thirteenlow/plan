import { useMemo } from 'react';
import { create } from 'zustand';
import { accountBalances, ageOfMoney } from '@/engine/accounts';
import { computeBudget, getMonth } from '@/engine/budget';
import { useActiveBudget, useBudgetData } from '@/store/store';
import type { BudgetData, Category, CategoryGroup, MonthKey } from '@/store/types';
import { addMonths, currentMonth } from '@/utils/date';

export type PlanFilter = 'all' | 'underfunded' | 'overspent' | 'available' | 'snoozed';
export type SpendingFilter = 'all' | 'uncleared' | 'unapproved' | 'uncategorized' | 'flagged';

/** Non-persisted UI state shared between screens (lets Home deep-link into filtered tabs). */
export const useUi = create<{
  month: MonthKey;
  setMonth: (m: MonthKey) => void;
  planFilter: PlanFilter;
  setPlanFilter: (f: PlanFilter) => void;
  spendingFilter: SpendingFilter;
  setSpendingFilter: (f: SpendingFilter) => void;
  /** An Assigned amount is being edited on Plan (the floating "+ Transaction" button steps aside) */
  assigning: boolean;
}>((set) => ({
  month: currentMonth(),
  setMonth: (month) => set({ month }),
  planFilter: 'all',
  setPlanFilter: (planFilter) => set({ planFilter }),
  spendingFilter: 'all',
  setSpendingFilter: (spendingFilter) => set({ spendingFilter }),
  assigning: false,
}));

export const MAX_FUTURE_MONTHS = 12;

const cache = new WeakMap<BudgetData, ReturnType<typeof computeBudget>>();
function compute(data: BudgetData) {
  let r = cache.get(data);
  if (!r) {
    r = computeBudget(data, addMonths(currentMonth(), MAX_FUTURE_MONTHS));
    cache.set(data, r);
  }
  return r;
}

export function useBudgetResult() {
  const data = useActiveBudget();
  return useMemo(() => compute(data), [data]);
}

export function useMonthBudget(month: MonthKey) {
  const result = useBudgetResult();
  return useMemo(() => getMonth(result, month), [result, month]);
}

export function useBalances() {
  const data = useBudgetData();
  return useMemo(() => (data ? accountBalances(data) : {}), [data]);
}

export function useAgeOfMoney() {
  const data = useBudgetData();
  return useMemo(() => (data ? ageOfMoney(data) : null), [data]);
}

export interface GroupWithCategories {
  group: CategoryGroup;
  categories: Category[];
}

export function sortedGroups(data: BudgetData, includeHidden = false): GroupWithCategories[] {
  return [...data.groups]
    .filter((g) => includeHidden || !g.hidden)
    .sort((a, b) => a.sort - b.sort)
    .map((group) => ({
      group,
      categories: data.categories.filter((c) => c.groupId === group.id && (includeHidden || !c.hidden)).sort((a, b) => a.sort - b.sort),
    }));
}

export function useLookups() {
  const data = useBudgetData();
  return useMemo(() => {
    const accounts = new Map(data?.accounts.map((a) => [a.id, a]));
    const categories = new Map(data?.categories.map((c) => [c.id, c]));
    const payees = new Map(data?.payees.map((p) => [p.id, p]));
    const groups = new Map(data?.groups.map((g) => [g.id, g]));
    return { accounts, categories, payees, groups };
  }, [data]);
}
