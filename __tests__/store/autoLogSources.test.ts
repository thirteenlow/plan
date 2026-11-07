import { readUnclearWithAI, savePayments, type InboxRow } from '@/cloud/inbox';
import { useCloud } from '@/cloud/cloudStore';
import { secretStore } from '@/security/deviceKey';
import { useStore } from '@/store/store';
import type { AutoLogSource } from '@/store/types';
import { defaultSources, filterOf, listenerConfig, newSource, PRESETS, sourceFor } from '@/utils/autoLogSources';
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
      row('Grab', 'GrabFood', 'Your GrabPay Wallet has been charged S$12.40 for your order'),
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

describe('Other apps’ notifications', () => {
  // The iOS 27 automation: amount = the notification (the server moves anything over 40 characters to card), merchant = the app.
  const ios = (app: string, text: string): InboxRow => (text.length > 40 ? { amount: text.slice(0, 40), merchant: app, card: text, created_at: NOW.toISOString() } : { amount: text, merchant: app, card: null, created_at: NOW.toISOString() });

  it('logs Grab’s charge and leaves out its other notifications', () => {
    const d = load([newSource({ kind: 'app', name: 'Grab', match: 'Grab' })]);
    const { imported } = savePayments(useStore.getState().budgets[d.id], [
      ios('Grab', 'Your GrabPay Wallet has been charged SGD 14.60 for booking A-7XK2PQ9MZT3B.'),
      ios('Grab', 'Your order was delivered at 03:57PM. Please check the location showing below to gather it if you haven’t done so.'),
      ios('Grab', 'Check out our catalogue to use your 120 GrabCoins!'),
      ios('Grab', 'Rate your 2 trips'),
      ios('Grab', 'Get 20% off your next ride, up to $5.00. Use code RIDE20.'),
    ]);
    expect(imported).toBe(1);
    expect(saved(d.id)).toMatchObject([{ payee: 'Grab', amount: -$(14.6) }]);
  });

  it('logs only alerts with the source’s filter words, in any case', () => {
    const grab = { ...newSource({ kind: 'app', name: 'Grab', match: 'Grab' }), filter: 'HAS BEEN CHARGED' };
    const kopi = { ...newSource({ kind: 'app', name: 'Kopi App', match: 'Kopi App' }), filter: '' };
    const d = load([grab, kopi]);
    savePayments(useStore.getState().budgets[d.id], [
      ios('Grab', 'Your GrabPay Wallet has been charged SGD 14.60 for booking A-1.'),
      ios('Grab', 'You paid SGD 9.00 at Toast Box with GrabPay'),
      ios('Kopi App', 'You paid SGD 3.20 at Kopi King'),
    ]);
    expect(saved(d.id).map((t) => t.amount)).toEqual([-$(14.6), -$(3.2)]);
  });

  it('knows the preset words for sources added before filters existed', () => {
    expect(filterOf({ kind: 'app', match: 'simplygo' })).toBe('Fare');
    expect(filterOf({ kind: 'app', match: 'Grab', filter: '' })).toBe('');
    expect(filterOf({ kind: 'app', match: 'YouTrip' })).toBe('');
  });
});

describe('Apple Pay with no merchant', () => {
  const tap = (merchant: string | null, amount = 'S$12.40'): InboxRow => ({ amount, merchant, card: 'Visa', created_at: NOW.toISOString() });
  const alert = (text: string): InboxRow => ({ amount: text.slice(0, 40), merchant: 'DBS PayLah! emails', card: null, details: text, created_at: NOW.toISOString() });
  const email = 'Transaction Ref: 1\nDate & Time: 04 Nov 15:03 (SGT)\nAmount: SGD12.40\nFrom: PayLah! Wallet (Mobile ending 1234)\nTo: KOPI CORNER';

  it('takes the payee from the bank’s alert and logs it once, whichever comes first', () => {
    const d = load([preset('Apple Pay'), preset('DBS PayLah! emails')]);
    savePayments(useStore.getState().budgets[d.id], [tap('Apple Wallet')]);
    expect(saved(d.id)).toMatchObject([{ payee: 'Apple Pay', amount: -$(12.4) }]);
    const { imported, notes } = savePayments(useStore.getState().budgets[d.id], [alert(email)]);
    expect(imported).toBe(0);
    expect(notes.join(' ')).toMatch(/combined/);
    expect(saved(d.id)).toMatchObject([{ payee: 'KOPI CORNER', amount: -$(12.4) }]);

    const e = load([preset('Apple Pay'), preset('DBS PayLah! emails')]);
    savePayments(useStore.getState().budgets[e.id], [alert(email), tap(null)]);
    expect(saved(e.id)).toMatchObject([{ payee: 'KOPI CORNER' }]);
  });

  it('keeps different payments apart', () => {
    const d = load([preset('Apple Pay')]);
    savePayments(useStore.getState().budgets[d.id], [tap('Starbucks'), tap('Toast Box'), tap('Starbucks', 'S$5.00')]);
    expect(saved(d.id)).toHaveLength(3);
  });
});

describe('iPhone Wallet notifications (the shared shortcut)', () => {
  // merchant = the notification's title (the shop), card = "Wallet: <message>", like MacroDroid.
  const alert = (title: string, body: string): InboxRow => ({ amount: body.slice(0, 40), merchant: title, card: `Wallet: ${body}`, created_at: NOW.toISOString() });

  it('logs the shop from the title and the card from the message', () => {
    const d = load([preset('Wallet')]);
    savePayments(useStore.getState().budgets[d.id], [alert('Toast Box', 'S$6.80 with DBS Visa Debit')]);
    expect(saved(d.id)).toMatchObject([{ payee: 'Toast Box', amount: -$(6.8) }]);
  });

  it('a placeholder card is ignored', () => {
    const d = load([]);
    savePayments(useStore.getState().budgets[d.id], [{ amount: 'S$3.00', merchant: 'Kopi', card: '(optional)', created_at: NOW.toISOString() }]);
    expect(saved(d.id)).toMatchObject([{ payee: 'Kopi', amount: -$(3) }]);
  });
});

