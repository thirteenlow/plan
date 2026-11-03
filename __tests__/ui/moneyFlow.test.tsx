import { act, render } from '@testing-library/react-native';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import React from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import MoveMoneyScreen from '@/app/move-money';
import TransactionScreen from '@/app/transaction';
import { MoneyFlow } from '@/components/MoneyMove';
import { GradientCard } from '@/components/ui';
import { useUi } from '@/hooks/useBudget';
import { useStore } from '@/store/store';
import { $, assign, income, makeBudget, NOW, spend, THIS_MONTH } from '../helpers/budget';

jest.useFakeTimers({ now: NOW, doNotFake: ['setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'nextTick'] });

const Home = () => <Text testID="home">home</Text>;
const active = () => useStore.getState().budgets[useStore.getState().activeBudgetId!];

function load() {
  const d = makeBudget();
  income(d, 1000);
  assign(d, THIS_MONTH, 'groceries', 200);
  assign(d, THIS_MONTH, 'dining', 50);
  useStore.setState({ budgets: { [d.id]: d }, activeBudgetId: d.id, sync: {}, hydrated: true });
  useUi.setState({ month: THIS_MONTH });
  return d;
}

describe('GradientCard', () => {
  it('its decorative circles never block taps on what overlaps them (the Cover button bug)', async () => {
    await render(
      <GradientCard>
        <Text>Ready to Assign</Text>
      </GradientCard>,
    );
    const absolute: { pointerEvents?: string }[] = [];
    type Node = { props?: { style?: unknown; pointerEvents?: string }; children?: (Node | string)[] | null };
    const walk = (n: Node | Node[] | null) => {
      if (!n) return;
      for (const x of Array.isArray(n) ? n : [n]) {
        if (StyleSheet.flatten(x.props?.style as never)?.position === 'absolute') absolute.push(x.props!);
        x.children?.forEach((c) => typeof c === 'object' && walk(c));
      }
    };
    walk(screen.toJSON() as Node | Node[] | null);
    expect(absolute.length).toBeGreaterThanOrEqual(2);
    for (const p of absolute) expect(p.pointerEvents).toBe('none');
  });
});

describe('MoneyFlow', () => {
  const info = { title: 'Money moved', from: { name: 'Shopping', caption: '$10.00 left' }, to: { name: 'Groceries', caption: '$5.00 left' }, amount: $(20), note: 'Moved $20.00 from Shopping to Groceries.' };

  it('shows where the money went and closes by itself', async () => {
    jest.useFakeTimers();
    const onDone = jest.fn();
    await render(<MoneyFlow info={info} onDone={onDone} />);
    expect(screen.getByText('Money moved')).toBeOnTheScreen();
    expect(screen.getByText('Shopping')).toBeOnTheScreen();
    expect(screen.getByText('Groceries')).toBeOnTheScreen();
    await act(async () => void jest.advanceTimersByTime(2500));
    expect(onDone).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('a warning stays open until dismissed', async () => {
    jest.useFakeTimers();
    const onDone = jest.fn();
    await render(<MoneyFlow info={{ ...info, warn: true, note: 'Dining Out is now overspent by $5.00.' }} onDone={onDone} />);
    await act(async () => void jest.advanceTimersByTime(10_000));
    expect(onDone).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Got it'));
    expect(onDone).toHaveBeenCalled();
    jest.useRealTimers();
  });
});

describe('animation after moving money', () => {
  it('Move shows the money travelling, then goes back', async () => {
    load();
    await renderRouter(
      { index: Home, 'move-money': MoveMoneyScreen },
      { initialUrl: `/move-money?month=${THIS_MONTH}&from=groceries&to=dining&amount=${$(30)}` },
    );
    await fireEvent.press(await screen.findByText('Move'));
    expect(await screen.findByText('Money moved')).toBeOnTheScreen();
    expect(screen.getByText('$170.00 left')).toBeOnTheScreen(); // Groceries after
    expect(screen.getByText('$80.00 left')).toBeOnTheScreen(); // Dining after
    expect(active().assigned[THIS_MONTH]).toMatchObject({ groceries: $(170), dining: $(80) });
  });

  it('covering an overspent category says so', async () => {
    const d = load();
    spend(d, 'dining', 80); // dining -30
    useStore.setState({ budgets: { [d.id]: { ...d } } });
    await renderRouter({ index: Home, 'move-money': MoveMoneyScreen }, { initialUrl: `/move-money?month=${THIS_MONTH}&from=groceries&to=dining&amount=${$(30)}` });
    await fireEvent.press(await screen.findByText('Move'));
    expect(await screen.findByText('Overspending covered')).toBeOnTheScreen();
  });

  it('refuses to move more than the category has, with no animation', async () => {
    load();
    await renderRouter({ index: Home, 'move-money': MoveMoneyScreen }, { initialUrl: `/move-money?month=${THIS_MONTH}&from=dining&to=groceries&amount=${$(500)}` });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await fireEvent.press(await screen.findByText('Move'));
    expect(screen.queryByText('Money moved')).toBeNull();
    expect(active().assigned[THIS_MONTH].dining).toBe($(50));
  });
});

describe('animation after logging a new transaction', () => {
  async function logSpending(category: string, cents: string) {
    await renderRouter({ index: Home, transaction: TransactionScreen }, { initialUrl: '/transaction' });
    await fireEvent.changeText(await screen.findByLabelText('Amount'), cents);
    await fireEvent.press(screen.getByText('Category'));
    await fireEvent.press(await screen.findByText(category));
    await fireEvent.press(screen.getByText('Save'));
  }

  it('spending shows what is left in the category and closes by itself', async () => {
    load();
    await logSpending('Groceries', '2500'); // $25.00
    expect(await screen.findByText('Spending logged')).toBeOnTheScreen();
    expect(screen.getByText('Groceries has $175.00 left this month.')).toBeOnTheScreen();
    expect(active().transactions.some((t) => t.amount === -$(25) && t.categoryId === 'groceries')).toBe(true);
    await waitFor(() => expect(screen).toHavePathname('/'), { timeout: 4000 });
  }, 15_000);

  it('overspending turns it into a warning that stays open', async () => {
    load();
    await logSpending('Dining Out', '8000'); // $80 of $50
    expect(await screen.findByText('Got it')).toBeOnTheScreen();
    expect(screen.getByText('Dining Out is now overspent by $30.00. Cover it from another category.')).toBeOnTheScreen();
    // (That it stays open over time is covered by "a warning stays open until dismissed" above.)
    expect(screen).toHavePathname('/transaction');
    await fireEvent.press(screen.getByText('Got it'));
    await waitFor(() => expect(screen).toHavePathname('/'));
  }, 15_000);
});
