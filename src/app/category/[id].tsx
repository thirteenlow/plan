import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { CategoryPanel } from '@/components/CategoryPanel';
import { useUi } from '@/hooks/useBudget';

export default function CategoryScreen() {
  const { id, month } = useLocalSearchParams<{ id: string; month?: string }>();
  const uiMonth = useUi((s) => s.month);
  return <CategoryPanel id={id} month={month ?? uiMonth} modal />;
}
