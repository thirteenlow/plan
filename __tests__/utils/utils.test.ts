import { computeBudget, getMonth } from '@/engine/budget';
import { RTA } from '@/store/types';
import { exportCsv, importCsv, isPlanCsv, isRegisterCsv, parseAmountText, parseCsv, safeFileName, detectDateFormat } from '@/utils/budgetCsv';
import { addDays, addMonths, addMonthsToDate, daysBetween, daysInMonth, formatDate, monthDiff, monthLabel, monthPickerOrder, monthRange } from '@/utils/date';
import { CURRENCIES, DEFAULT_CURRENCY, formatMoney, milliToInput, parseMoney, signedInput } from '@/utils/money';
import { matchAccount, matchCategory, merchantKey, payeeCategory } from '@/utils/scanMatch';
import { filterAmountTyping, isValidBudget, sanitizeText, validateAmount, validateName } from '@/utils/validation';
import { amountInText, readWalletPayment } from '@/utils/walletNotification';
import { $, assign, income, makeBudget, NOW, spend, THIS_MONTH, tx } from '../helpers/budget';

const USD = DEFAULT_CURRENCY;
const EUR = { code: 'EUR', symbol: '€', decimals: 2, symbolFirst: false, group: '.', decimal: ',' };

describe('money', () => {
  it('formats milliunits with symbol, grouping and sign', () => {
    expect(formatMoney($(1234.5), { c: USD })).toBe('$1,234.50');
    expect(formatMoney(-$(7.5), { c: USD })).toBe('-$7.50');
    expect(formatMoney($(5), { c: USD, sign: true })).toBe('+$5.00');
    expect(formatMoney($(1234.5), { c: EUR })).toBe('1.234,50 €');
    expect(formatMoney($(12_500), { c: USD, compact: true })).toBe('$12.5k');
  });

  it('never shows "-$0.00"', () => expect(formatMoney(-1, { c: USD })).toBe('$0.00'));

  it('parses plain amounts, grouping, symbols and calculator math', () => {
    expect(parseMoney('12.34', USD)).toBe(12_340);
    expect(parseMoney('$1,234.50', USD)).toBe($(1234.5));
    expect(parseMoney('120+35.5', USD)).toBe($(155.5));
    expect(parseMoney('300/3', USD)).toBe($(100));
    expect(parseMoney('(2+3)*4', USD)).toBe($(20));
    expect(parseMoney('1.234,50', EUR)).toBe($(1234.5));
    expect(parseMoney('', USD)).toBe(0);
  });

  it('rejects invalid or huge input', () => {
    expect(parseMoney('abc', USD)).toBeNull();
    expect(parseMoney('1/0', USD)).toBeNull();
    expect(parseMoney('9999999999999', USD)).toBeNull();
    expect(parseMoney('2+', USD)).toBeNull();
  });

  it('milliToInput prefills fields', () => {
    expect(milliToInput(0, USD)).toBe('');
    expect(milliToInput(-$(45.5), USD)).toBe('45.50');
  });

  it('every currency preset round-trips through format and parse', () => {
    for (const c of CURRENCIES) expect(parseMoney(formatMoney($(1234.56), { c }), c)).toBe(Math.round($(1234.56) / 10 ** (3 - c.decimals)) * 10 ** (3 - c.decimals));
  });
});

describe('dates', () => {
  it('month arithmetic', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthDiff('2026-01', '2026-11')).toBe(10);
    expect(monthRange('2026-10', '2026-12')).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(daysInMonth('2028-02')).toBe(29);
    expect(monthLabel('2026-11')).toBe('November 2026');
  });

  it('day arithmetic', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-01', '2026-11-15')).toBe(14);
  });

  it('formats in the chosen order', () => {
    expect(formatDate('2026-11-03', 'DMY')).toMatch(/^03.11.2026$/);
    expect(formatDate('2026-11-03', 'MDY')).toMatch(/^11.03.2026$/);
    expect(formatDate('2026-11-03', 'YMD')).toMatch(/^2026.11.03$/);
  });
});

describe('validation', () => {
  it('amount entry shifts digits in from the right', () => {
    expect(filterAmountTyping('1', USD)).toBe('0.01');
    expect(filterAmountTyping('100', USD)).toBe('1.00');
    expect(filterAmountTyping('123456', USD)).toBe('1,234.56');
    expect(filterAmountTyping('-5', USD, { allowNegative: true })).toBe('-0.05');
    expect(filterAmountTyping('-5', USD)).toBe('0.05');
  });

  it('validates amounts', () => {
    expect(validateAmount(null)).toMatch(/valid/);
    expect(validateAmount(0)).toMatch(/zero/);
    expect(validateAmount(-1)).toMatch(/negative/);
    expect(validateAmount(0, { allowZero: true })).toBeNull();
    expect(validateAmount(5000)).toBeNull();
  });

  it('validates names and duplicates', () => {
    expect(validateName('  ', { label: 'Category', max: 20 })).toMatch(/empty/);
    expect(validateName('!!!', { label: 'Category', max: 20 })).toMatch(/letter or number/);
    expect(validateName('rent', { label: 'Category', max: 20, existing: ['Rent'] })).toMatch(/already exists/);
    expect(validateName('rent', { label: 'Category', max: 20, existing: ['Rent'], current: 'Rent' })).toBeNull();
  });

  it('sanitizes text', () => expect(sanitizeText('  a\u0000  b\n c ', 10)).toBe('a b c'));

  it('rejects corrupt budgets', () => {
    expect(isValidBudget(makeBudget())).toBe(true);
    expect(isValidBudget(null)).toBe(false);
    expect(isValidBudget({ ...makeBudget(), transactions: [{ id: 'x', accountId: 'a', date: 'bad', amount: 1 }] })).toBe(false);
    expect(isValidBudget({ ...makeBudget(), transactions: [{ id: 'x', accountId: 'a', date: '2026-01-01', amount: 1.5 }] })).toBe(false);
  });
});

describe('CSV export / import', () => {
  beforeAll(() => jest.useFakeTimers({ now: NOW }));
  afterAll(() => jest.useRealTimers());

  it('parses quoted CSV', () => {
    expect(parseCsv('a,"b,c","d ""e"""\n1,2,3')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });

  it('reads amounts in many styles', () => {
    expect(parseAmountText('$1,234.56')).toBe($(1234.56));
    expect(parseAmountText('-€12,50')).toBe(-$(12.5));
    expect(parseAmountText('(4.00)')).toBe(-$(4));
    expect(parseAmountText('1 234,56 kr')).toBe($(1234.56));
  });

  it('detects the date order', () => {
    expect(detectDateFormat(['29/10/2026'], 'MDY')).toBe('DMY');
    expect(detectDateFormat(['10/29/2026'], 'DMY')).toBe('MDY');
    expect(detectDateFormat(['2026-10-29'], 'DMY')).toBe('YMD');
  });

  it('makes safe file names', () => expect(safeFileName('ys’s Plan :)')).toBe("ys's Plan"));

  it('round-trips a budget: same balances and plan after export and import', () => {
    const d = makeBudget();
    d.payees.push({ id: 'p1', name: 'Market' });
    income(d, 2000);
    assign(d, THIS_MONTH, 'groceries', 300);
    assign(d, THIS_MONTH, 'rent', 1200);
    tx(d, { amount: -$(80), date: `${THIS_MONTH}-04`, categoryId: 'groceries', payeeId: 'p1' });
    spend(d, 'dining', 25, `${THIS_MONTH}-06`, 'visa');
    tx(d, { amount: -$(25), date: `${THIS_MONTH}-12`, accountId: 'checking', transferAccountId: 'visa' });
    tx(d, { amount: $(25), date: `${THIS_MONTH}-12`, accountId: 'visa', transferAccountId: 'checking' });

    const { register, plan } = exportCsv(d);
    expect(isRegisterCsv(register)).toBe(true);
    expect(isPlanCsv(plan)).toBe(true);

    const back = importCsv(register, plan, { name: 'Back', currency: USD, dateFormat: 'MDY', today: '2026-11-15' });
    const before = getMonth(computeBudget(d), THIS_MONTH);
    const after = getMonth(computeBudget(back), THIS_MONTH);
    expect(after.readyToAssign).toBe(before.readyToAssign);
    const byName = (data: typeof d, name: string) => data.categories.find((c) => c.name === name)!.id;
    for (const name of ['Groceries', 'Dining Out', 'Rent']) {
      expect(after.categories[byName(back, name)]?.available ?? 0).toBe(before.categories[byName(d, name)]?.available ?? 0);
    }
    expect(back.accounts.find((a) => a.name === 'Visa')?.type).toBe('creditCard');
    expect(back.transactions.filter((t) => t.transferAccountId)).toHaveLength(2);
    expect(back.transactions.some((t) => t.categoryId === RTA)).toBe(true);
  });
});

describe('receipt scan matching', () => {
  const d = makeBudget();
  d.payees.push({ id: 'p1', name: 'Starbucks', lastCategoryId: 'dining' });

  it('matches categories by name, partial name and synonyms', () => {
    expect(matchCategory(d, 'groceries')).toBe('groceries');
    expect(matchCategory(d, 'Dining')).toBe('dining');
    expect(matchCategory(d, 'zzz')).toBeNull();
    expect(matchCategory(d, 'Visa')).toBeNull(); // card payment categories are never picked
  });

  it('remembers the category for a merchant even with store numbers', () => {
    expect(merchantKey('STARBUCKS #1234 Pte Ltd')).toBe('starbucks');
    expect(payeeCategory(d, 'STARBUCKS #1234')).toBe('dining');
    expect(payeeCategory(d, 'Starbucks Raffles Place')).toBe('dining');
    expect(payeeCategory(d, 'Cafe')).toBeNull();
  });

  it('matches accounts by name or last four digits', () => {
    const d2 = makeBudget();
    d2.accounts[1].name = 'Visa 4242';
    expect(matchAccount(d2, 'checking')).toBe('checking');
    expect(matchAccount(d2, 'Card ending 4242')).toBe('visa');
    expect(matchAccount(d2, 'Amex')).toBeNull();
  });
});

describe('Android wallet notifications (MacroDroid)', () => {
  it('reads Google Wallet: title is the merchant, text has amount and card', () => {
    const text = '$4.50 with Visa •••• 1234';
    expect(readWalletPayment({ amount: text, merchant: 'Starbucks', card: `Google Wallet: ${text}` })).toEqual({
      wallet: 'Google Wallet',
      amount: $(4.5),
      merchant: 'Starbucks',
      card: 'Visa •••• 1234',
    });
  });

  it('reads Samsung Wallet when the title is the wallet name and the merchant is in the text', () => {
    const text = 'S$12.30 paid at STARBUCKS with Mastercard •••• 9876';
    const p = readWalletPayment({ amount: text, merchant: 'Samsung Wallet', card: `Samsung Wallet: ${text}` });
    expect(p).toMatchObject({ wallet: 'Samsung Wallet', amount: $(12.3), merchant: 'STARBUCKS', card: 'Mastercard •••• 9876' });
  });

  it('reads another app forwarded by an iOS notification automation, keeping its name', () => {
    const text = 'A fare of $2.38 for your journeys on 3 Nov has been charged to your Visa card ending 1234.';
    const p = readWalletPayment({ amount: text, merchant: 'SimplyGo', card: `SimplyGo: ${text}` });
    expect(p).toMatchObject({ wallet: 'SimplyGo', amount: $(2.38), merchant: 'SimplyGo' });
  });

  it('reads real SimplyGo fare alerts from iPhone (merchant sent as the app) and Android (title sent)', () => {
    const bus = ' Fare $0.20 - Bus 851 Dhoby Ghaut Stn Exit A - Opp Blk 3 - 2 Mar 09:15';
    expect(readWalletPayment({ amount: bus.slice(0, 40), merchant: 'SimplyGo', card: `SimplyGo: ${bus}` })).toEqual({
      wallet: 'SimplyGo',
      amount: $(0.2),
      merchant: 'SimplyGo',
      card: null,
      note: 'Bus 851 Dhoby Ghaut Stn Exit A - Opp Blk 3 - 2 Mar 09:15',
    });
    const train = ' Fare $0.54 - Bishan - Raffles Place - 2 Mar 08:45';
    expect(readWalletPayment({ amount: train, merchant: 'Trip Fare Alert', card: `SimplyGo: ${train}` })).toMatchObject({ amount: $(0.54), merchant: 'SimplyGo', card: null, note: 'Bishan - Raffles Place - 2 Mar 08:45' });
  });

  it('reads a notification sent as both amount and card, with the app as merchant (iOS 27)', () => {
    const bus = 'Fare $1.28 - Bus 12 Blk 108 - Clementi Int Alighting - 2 Mar 18:40';
    expect(readWalletPayment({ amount: bus.slice(0, 40), merchant: 'SimplyGo', card: bus })).toMatchObject({ wallet: 'SimplyGo', amount: $(1.28), merchant: 'SimplyGo', note: 'Bus 12 Blk 108 - Clementi Int Alighting - 2 Mar 18:40' });
    // An ordinary Apple Pay row is untouched.
    expect(readWalletPayment({ amount: 'S$4.50', merchant: 'Kopi', card: 'S$4.50 card' })).toBeNull();
  });

  it('reads a SimplyGo alert sent as the amount only (no card field)', () => {
    const train = 'Fare $0.54 - Bishan - Raffles Place - 2 Mar 08:45';
    // Short enough to arrive whole in amount
    expect(readWalletPayment({ amount: train.slice(0, 40), merchant: 'SimplyGo', card: null })).toMatchObject({ wallet: 'SimplyGo', amount: $(0.54), merchant: 'SimplyGo' });
    // Longer: the server keeps the full text in card
    expect(readWalletPayment({ amount: train.slice(0, 40), merchant: 'SimplyGo', card: train })).toMatchObject({ amount: $(0.54), note: 'Bishan - Raffles Place - 2 Mar 08:45' });
    // A plain Apple Pay payment without a card name stays an ordinary payment
    expect(readWalletPayment({ amount: 'SGD 4.50', merchant: 'Kopi', card: null })).toBeNull();
  });

  it('ignores rows that are not forwarded notifications (Apple Pay, scans)', () => {
    expect(readWalletPayment({ amount: '4.50', merchant: 'Starbucks', card: 'Visa' })).toBeNull();
  });

  it('does not mistake the card digits for the amount', () => {
    expect(amountInText('€7,90 with Visa •••• 1234')).toBe($(7.9));
    expect(amountInText('Paid 1,234.00 USD')).toBe($(1234));
    expect(amountInText('no money here •••• 1234')).toBe(0);
  });

  // Known bug: masked card digits followed by a symbol-first amount are read as "1234 €". Remove `.failing` once fixed.
  it.failing('reads the amount when it comes after the card number', () => {
    expect(amountInText('Visa •••• 1234 €7,90')).toBe($(7.9));
  });
});

describe('monthPickerOrder', () => {
  it('lists this year first (Jan to Dec), then later years, then earlier years newest first', () => {
    const order = monthPickerOrder(monthRange('2024-11', '2027-02'), '2026-11');
    expect(order.slice(0, 12)).toEqual(monthRange('2026-01', '2026-12'));
    expect(order.slice(12, 14)).toEqual(['2027-01', '2027-02']);
    expect(order.slice(14, 26)).toEqual(monthRange('2025-01', '2025-12'));
    expect(order.slice(26)).toEqual(['2024-11', '2024-12']);
    expect(order).toHaveLength(monthRange('2024-11', '2027-02').length);
  });
});

describe('signedInput', () => {
  it('keeps the minus sign so a negative Assigned amount round-trips through the editor', () => {
    const c = DEFAULT_CURRENCY;
    expect(signedInput(-30_000, c)).toBe('-' + milliToInput(30_000, c));
    expect(parseMoney(signedInput(-30_000, c), c)).toBe(-30_000);
    expect(signedInput(12_500, c)).toBe(milliToInput(12_500, c));
    expect(signedInput(0, c)).toBe('');
  });
});
