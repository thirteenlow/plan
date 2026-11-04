import { readUnclearWithAI, savePayments, type InboxRow } from '@/cloud/inbox';
import { useCloud } from '@/cloud/cloudStore';
import { secretStore } from '@/security/deviceKey';
import { useStore } from '@/store/store';
import type { AutoLogSource } from '@/store/types';
import { defaultSources, listenerConfig, newSource, PRESETS, sourceFor } from '@/utils/autoLogSources';
import { $, addAccount, makeBudget, NOW } from '../helpers/budget';

const preset = (name: string) => newSource(PRESETS.find((p) => p.name === name)!);
const row = (app: string, title: string, text: string): InboxRow => ({ amount: text, merchant: title, card: `${app}: ${text}`, created_at: NOW.toISOString() });

function load(sources: AutoLogSource[]) {
  const d = makeBudget();
  d.settings.autoLogSources = sources;
  useStore.setState({ budgets: { [d.id]: d }, activeBudgetId: d.id, sync: {}, hydrated: true });
  return d;
}
const saved = (id: string) => {
  const b = useStore.getState().budgets[id];
  return b.transactions.filter((t) => !t.approved).map((t) => ({ payee: b.payees.find((p) => p.id === t.payeeId)?.name, amount: t.amount, accountId: t.accountId, categoryId: t.categoryId }));
};

describe('Auto-log sources', () => {
  it('matches payments to a source by where they came from', () => {
    const sources = [preset('Apple Pay'), preset('SimplyGo'), newSource({ kind: 'app', name: 'Grab', match: 'Grab' })];
    expect(sourceFor(sources, 'Apple Pay')?.name).toBe('Apple Pay');
    expect(sourceFor(sources, 'simplygo')?.name).toBe('SimplyGo');
    expect(sourceFor(sources, 'Grab Driver')?.name).toBe('Grab');
    expect(sourceFor(sources, 'YouTrip')).toBeUndefined();
  });

  it('phones start with what they can do', () => {
    expect(defaultSources('ios').map((s) => s.name)).toEqual(['Apple Pay', 'SimplyGo']);
    expect(defaultSources('android-app').map((s) => s.name)).toEqual(['Google Wallet', 'Samsung Wallet', 'SimplyGo']);
  });

  it('tells the Android listener which wallets and apps to read', () => {
    const off = { ...preset('Samsung Wallet'), enabled: false };
    expect(listenerConfig([preset('SimplyGo'), off, newSource({ kind: 'app', name: 'Grab', match: 'Grab' })])).toEqual({ wallets: false, apps: ['SimplyGo', 'Grab'] });
    expect(listenerConfig([preset('Google Wallet')]).wallets).toBe(true);
  });

  it('applies each source’s options when logging', () => {
    const grab = { ...newSource({ kind: 'app', name: 'Grab', match: 'Grab' }), categoryId: 'dining', moneyIn: 'ignore' as const };
    const youtrip = { ...newSource({ kind: 'app', name: 'YouTrip', match: 'YouTrip' }), enabled: false };
    const d = load([grab, youtrip]);
    const card = addAccount(d, 'creditCard', 'Grab card');
    grab.accountId = card.id;
    useStore.getState().updateSettings({ autoLogSources: [grab, youtrip] });

    const { imported } = savePayments(useStore.getState().budgets[d.id], [
      row('Grab', 'GrabFood', 'You paid S$12.40 for your order'),
      row('Grab', 'GrabPay', 'Alex sent you S$5.00'),
      row('YouTrip', 'YouTrip', 'S$30.00 at Uniqlo'),
    ]);

    expect(imported).toBe(1);
    expect(saved(d.id)).toEqual([{ payee: 'GrabFood', amount: -$(12.4), accountId: card.id, categoryId: 'dining' }]);
  });

  it('logs payments from places with no source as before', () => {
    const d = load([preset('Apple Pay')]);
    savePayments(useStore.getState().budgets[d.id], [row('SimplyGo', 'Trip Fare Alert', 'Fare $1.28 - Bus 12 Blk 108 - Clementi Int')]);
    expect(saved(d.id)).toMatchObject([{ payee: 'SimplyGo', amount: -$(1.28) }]);
  });
});

describe('AI fallback for payments Plan can’t read', () => {
  const odd = 'Hi! Your Moomoo card was charged for KOPI KING. Total due: 4 dollars 50.';
  const emailRow: InboxRow = { amount: odd.slice(0, 40), merchant: 'Moomoo emails', card: null, details: odd, created_at: NOW.toISOString() };

  beforeEach(() => {
    useCloud.setState({ user: { id: 'u1' } as never });
    jest.spyOn(secretStore, 'get').mockResolvedValue('k'.repeat(30));
  });
  afterEach(() => jest.restoreAllMocks());

  it('asks the AI, then logs what it read', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ ok: true, is_payment: true, direction: 'out', amount: '4.50', merchant: 'Kopi King', account: null }) } as Response);
    const d = load([newSource({ kind: 'email', name: 'Moomoo emails', match: 'Moomoo emails' })]);
    const rows = await readUnclearWithAI(useStore.getState().budgets[d.id], [emailRow]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ text: odd, currency: 'USD' });
    savePayments(useStore.getState().budgets[d.id], rows);
    expect(saved(d.id)).toMatchObject([{ payee: 'Kopi King', amount: -$(4.5) }]);
  });

  it('never asks when the source has AI turned off, or Plan read it fine', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const d = load([{ ...newSource({ kind: 'email', name: 'Moomoo emails', match: 'Moomoo emails' }), ai: false }]);
    await readUnclearWithAI(useStore.getState().budgets[d.id], [emailRow, row('SimplyGo', 'Trip Fare Alert', 'Fare $1.28 - Bus 12 Blk 108 - Clementi Int')]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
