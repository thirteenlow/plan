import type { QueuedNotification } from '../../modules/payment-notifications';
import { useStore } from '@/store/store';
import { $, addAccount, makeBudget, NOW } from '../helpers/budget';

// Stand-in for the Android notification listener: a queue the test fills.
const queue: QueuedNotification[] = [];
jest.mock('../../modules/payment-notifications', () => ({
  __esModule: true,
  default: {
    peek: () => [...queue],
    ack: (upTo: number) => queue.splice(0, queue.filter((q) => q.id <= upTo).length),
  },
}));

// eslint-disable-next-line import/first
import { importNativePayments } from '@/cloud/nativePayments';

const notification = (id: number, app: string, title: string, text: string): QueuedNotification => ({ id, app, title, text, postedAt: NOW.getTime() });

function load() {
  const d = makeBudget();
  addAccount(d, 'creditCard', 'DBS Card 1234');
  useStore.setState({ budgets: { [d.id]: d }, activeBudgetId: d.id, sync: {}, hydrated: true });
  return d;
}

describe('importNativePayments (Android app)', () => {
  beforeEach(() => queue.splice(0));

  it('logs a Google Wallet tap and a SimplyGo fare, then empties the phone’s queue', async () => {
    const d = load();
    queue.push(notification(1, 'Wallet', 'Starbucks', '$4.50 with Mastercard •••• 1234'));
    queue.push(notification(2, 'SimplyGo', 'Trip Fare Alert', 'Fare $1.28 - Bus 12 Blk 108 - Clementi Int'));

    expect(await importNativePayments()).toBe(2);
    const saved = useStore.getState().budgets[d.id];
    const payee = (id?: string | null) => saved.payees.find((p) => p.id === id)?.name;
    const txs = saved.transactions.filter((t) => !t.approved);
    const starbucks = txs.find((t) => payee(t.payeeId) === 'Starbucks');
    expect(starbucks).toMatchObject({ amount: -$(4.5), memo: 'Google Wallet · Mastercard •••• 1234' });
    expect(saved.accounts.find((a) => a.id === starbucks?.accountId)?.name).toBe('DBS Card 1234');
    expect(txs.find((t) => payee(t.payeeId) === 'SimplyGo')).toMatchObject({ amount: -$(1.28) });
    expect(queue).toHaveLength(0);
  });

  it('logs money coming in as an inflow, and skips top-ups and declined payments', async () => {
    const d = load();
    queue.push(notification(1, 'YouTrip', 'YouTrip', 'Alex sent you S$20.00'));
    queue.push(notification(2, 'Wallet', 'Starbucks', 'Refund of $4.50 to Mastercard •••• 1234'));
    queue.push(notification(3, 'YouTrip', 'YouTrip', 'You topped up S$100.00 from DBS'));
    queue.push(notification(4, 'Wallet', 'Starbucks', 'Payment of $4.50 declined'));

    expect(await importNativePayments()).toBe(2);
    const saved = useStore.getState().budgets[d.id];
    const payee = (id?: string | null) => saved.payees.find((p) => p.id === id)?.name;
    const txs = saved.transactions.filter((t) => !t.approved);
    expect(txs.map((t) => [payee(t.payeeId), t.amount]).sort()).toEqual([
      ['Alex', $(20)],
      ['Starbucks', $(4.5)],
    ]);
    expect(queue).toHaveLength(0);
  });

  it('leaves notifications on the phone when there is no account to log them to', async () => {
    const d = makeBudget({ accounts: [] });
    useStore.setState({ budgets: { [d.id]: d }, activeBudgetId: d.id, sync: {}, hydrated: true });
    queue.push(notification(1, 'Wallet', 'Starbucks', '$4.50 with Mastercard •••• 1234'));
    expect(await importNativePayments()).toBe(0);
    expect(queue).toHaveLength(1);
  });
});
