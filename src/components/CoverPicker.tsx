import { router } from 'expo-router';
import React, { useState } from 'react';
import { PickerSheet } from '@/components/Sheet';
import { IconBadge, Txt } from '@/components/ui';
import { categoryMonth, type MonthBudget } from '@/engine/budget';
import type { BudgetData, MonthKey } from '@/store/types';
import { formatMoney } from '@/utils/money';

/** Opens Move money to cover one overspent category, with what it needs filled in. */
export function coverCategory(month: MonthKey, mb: MonthBudget, categoryId: string) {
  router.push({ pathname: '/move-money', params: { month, to: categoryId, amount: String(-categoryMonth(mb, categoryId).available) } });
}

/**
 * Cover, shared by Home and the Plan tab: one overspent category goes straight to Move money; several open a
 * sheet to choose which one to fix first (most overspent at the top).
 */
export function useCover(data: BudgetData, mb: MonthBudget, month: MonthKey) {
  const [choices, setChoices] = useState<string[] | null>(null);

  const cover = (overspentIds: string[]) => {
    const ids = [...overspentIds].sort((a, b) => categoryMonth(mb, a).available - categoryMonth(mb, b).available);
    if (ids.length > 1) setChoices(ids);
    else if (ids[0]) coverCategory(month, mb, ids[0]);
  };

  const sheet = (
    <PickerSheet
      visible={!!choices}
      onClose={() => setChoices(null)}
      title="Which category to cover?"
      searchable={(choices?.length ?? 0) > 8}
      items={(choices ?? []).map((id) => {
        const c = data.categories.find((x) => x.id === id);
        const over = -categoryMonth(mb, id).available;
        return {
          key: id,
          title: c?.name ?? 'Category',
          subtitle: `Overspent by ${formatMoney(over)}`,
          left: <IconBadge name={c?.name ?? '?'} size={32} />,
          right: (
            <Txt variant="label" tone="danger">
              {formatMoney(-over)}
            </Txt>
          ),
        };
      })}
      onSelect={(id) => {
        setChoices(null);
        coverCategory(month, mb, id);
      }}
    />
  );

  return { cover, sheet };
}
