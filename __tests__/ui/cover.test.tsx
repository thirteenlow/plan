import { renderHook } from '@testing-library/react-native';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import React from 'react';
import { Text } from 'react-native';
import HomeScreen from '@/app/(tabs)/index';
import PlanScreen from '@/app/(tabs)/plan';
import { computeBudget, getMonth } from '@/engine/budget';
import { useUi } from '@/hooks/useBudget';
import { mostOverspent, useTodos } from '@/hooks/useTodos';
import { useStore } from '@/store/store';
import { $, assign, income, makeBudget, NOW, spend, THIS_MONTH } from '../helpers/budget';

jest.useFakeTimers({ now: NOW, doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'nextTick'] });

/** Two overspent categories: Dining (-$30) and Groceries (-$80, the worst). */
function load() {
  const d = makeBudget();
  income(d, 1000);
  assign(d, THIS_MONTH, 'rent', 500);
  spend(d, 'dining', 30);
  spend(d, 'groceries', 80);
  useStore.setState({ budgets: { [d.id]: d }, activeBudgetId: d.id, sync: {}, hydrated: true });
  useUi.setState({ month: THIS_MONTH, planFilter: 'all' });
  return d;
}

/** Stand-in for the Move money screen: shows the params it was opened with. */
function MoveMoneyStub() {
  const { useLocalSearchParams } = jest.requireActual('expo-router');
  const p = useLocalSearchParams();
  return <Text testID="move-money">{`to=${p.to} amount=${p.amount}`}</Text>;
}

describe('mostOverspent / useTodos', () => {
  it('picks the category overspent by the most', () => {
    const d = load();
    const mb = getMonth(computeBudget(d), THIS_MONTH);
    expect(mostOverspent(['dining', 'groceries'], mb)).toBe('groceries');
    expect(mostOverspent([], mb)).toBeUndefined();
  });

  it('the Home to-do for 2+ overspent categories still points at one category to cover', async () => {
    load();
    const { result } = await renderHook(() => useTodos());
    expect(result.current[0]).toMatchObject({ kind: 'overspent', count: 2, action: 'Cover', categoryId: 'groceries' });
  });
});

describe('Cover opens Move money (2+ overspent categories)', () => {
  it('from the Plan tab', async () => {
    load();
    await renderRouter({ '(tabs)/plan': PlanScreen, 'move-money': MoveMoneyStub }, { initialUrl: '/plan' });
    await fireEvent.press(await screen.findByText('Cover'));
    expect(await screen.findByTestId('move-money')).toHaveTextContent(`to=groceries amount=${$(80)}`);
    expect(screen).toHavePathname('/move-money');
  });

  it('from Home', async () => {
    load();
    await renderRouter({ '(tabs)/index': HomeScreen, 'move-money': MoveMoneyStub }, { initialUrl: '/' });
    await fireEvent.press(await screen.findByLabelText('Cover: Overspent categories'));
    expect(await screen.findByTestId('move-money')).toHaveTextContent(`to=groceries amount=${$(80)}`);
  });
});
