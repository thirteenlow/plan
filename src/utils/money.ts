import type { CurrencyFormat, Milli } from '@/store/types';

export interface CurrencyPreset extends CurrencyFormat {
  name: string;
}

const preset = (code: string, name: string, symbol: string, decimals = 2, symbolFirst = true, group = ',', decimal = '.'): CurrencyPreset => ({
  code,
  name,
  symbol,
  decimals,
  symbolFirst,
  group,
  decimal,
  showSymbol: true,
});

/** Common currencies with their usual formatting; every part can be changed afterwards. */
export const CURRENCIES: CurrencyPreset[] = [
  preset('USD', 'US Dollar', '$'),
  preset('SGD', 'Singapore Dollar', 'S$'),
  preset('EUR', 'Euro', '€', 2, false, '.', ','),
  preset('GBP', 'British Pound', '£'),
  preset('AUD', 'Australian Dollar', 'A$'),
  preset('CAD', 'Canadian Dollar', 'C$'),
  preset('NZD', 'New Zealand Dollar', 'NZ$'),
  preset('MYR', 'Malaysian Ringgit', 'RM'),
  preset('IDR', 'Indonesian Rupiah', 'Rp', 0, true, '.', ','),
  preset('THB', 'Thai Baht', '฿'),
  preset('PHP', 'Philippine Peso', '₱'),
  preset('VND', 'Vietnamese Dong', '₫', 0, false, '.', ','),
  preset('HKD', 'Hong Kong Dollar', 'HK$'),
  preset('CNY', 'Chinese Yuan', '¥'),
  preset('JPY', 'Japanese Yen', '¥', 0),
  preset('KRW', 'South Korean Won', '₩', 0),
  preset('TWD', 'New Taiwan Dollar', 'NT$'),
  preset('INR', 'Indian Rupee', '₹'),
  preset('AED', 'UAE Dirham', 'AED'),
  preset('CHF', 'Swiss Franc', 'CHF', 2, true, "'", '.'),
  preset('SEK', 'Swedish Krona', 'kr', 2, false, ' ', ','),
  preset('NOK', 'Norwegian Krone', 'kr', 2, false, ' ', ','),
  preset('DKK', 'Danish Krone', 'kr.', 2, false, '.', ','),
  preset('PLN', 'Polish Złoty', 'zł', 2, false, ' ', ','),
  preset('BRL', 'Brazilian Real', 'R$', 2, true, '.', ','),
  preset('MXN', 'Mexican Peso', 'MX$'),
  preset('ZAR', 'South African Rand', 'R', 2, true, ' ', '.'),
  preset('KWD', 'Kuwaiti Dinar', 'KD', 3),
];

/** Number formats offered at setup (thousands separator + decimal mark). */
export const NUMBER_FORMATS: { group: string; decimal: string }[] = [
  { group: ',', decimal: '.' },
  { group: '.', decimal: ',' },
  { group: ' ', decimal: ',' },
  { group: ' ', decimal: '.' },
  { group: "'", decimal: '.' },
  { group: '', decimal: '.' },
  { group: '', decimal: ',' },
];

export const DEFAULT_CURRENCY: CurrencyFormat = CURRENCIES[0];

/** Largest amount accepted anywhere in the app: 999,999,999.999 (in milliunits). */
export const MAX_AMOUNT: Milli = 999_999_999_999;

let active: CurrencyFormat = DEFAULT_CURRENCY;
/** The active budget's currency; set by the store whenever the budget changes. */
export const setActiveCurrency = (c: CurrencyFormat) => {
  active = c;
};
export const getActiveCurrency = () => active;

export const toMilli = (n: number): Milli => Math.round(n * 1000);
export const fromMilli = (m: Milli): number => m / 1000;

function groupDigits(int: string, sep: string) {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** Plain number string without symbol, e.g. "1,234.50" */
export function formatNumber(m: Milli, c: CurrencyFormat = active): string {
  const value = Math.abs(m) / 1000;
  const fixed = value.toFixed(c.decimals);
  const [int, dec] = fixed.split('.');
  return groupDigits(int, c.group) + (dec ? c.decimal + dec : '');
}

export function formatMoney(m: Milli, opts: { sign?: boolean; c?: CurrencyFormat; compact?: boolean; whole?: boolean } = {}): string {
  const base = opts.c ?? active;
  // `whole` drops cents for amounts of 1,000 or more (used in tight stat tiles).
  const c = opts.whole && Math.abs(m) >= 1_000_000 ? { ...base, decimals: 0 } : base;
  const neg = m < 0 && Math.round(Math.abs(m) / 10 ** (3 - c.decimals)) !== 0;
  let body: string;
  if (opts.compact && Math.abs(m) >= 10_000_000) {
    const v = Math.abs(m) / 1000;
    body = v >= 1e6 ? `${(v / 1e6).toFixed(1).replace(/\.0$/, '')}M` : `${(v / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  } else {
    body = formatNumber(m, c);
  }
  const withSymbol = applySymbol(body, c);
  if (neg) return `-${withSymbol}`;
  if (opts.sign && m > 0) return `+${withSymbol}`;
  return withSymbol;
}

/** Places the currency symbol before/after the number, or hides it. */
export function applySymbol(body: string, c: CurrencyFormat): string {
  const symbol = c.symbol.trim();
  if (c.showSymbol === false || !symbol) return body;
  if (!c.symbolFirst) return `${body} ${symbol}`;
  // Letter symbols ("RM", "CHF") read better with a space: "RM 12.00".
  return /[A-Za-z.]$/.test(symbol) ? `${symbol} ${body}` : `${symbol}${body}`;
}

/**
 * Parses user input into milliunits. Supports simple math like "120+35.5" or "300/3",
 * like a calculator-style input. Returns null when the input is not valid.
 */
export function parseMoney(input: string, c: CurrencyFormat = active): Milli | null {
  let s = input.trim();
  if (!s) return 0;
  if (s.length > 60) return null;
  const symbol = c.symbol.trim();
  if (symbol) s = s.split(symbol).join('');
  s = s.replace(/\s/g, '');
  if (c.decimal === ',') s = s.split('.').join('').replace(/,/g, '.');
  else if (c.group) s = s.split(c.group).join('');
  if (!/^[-+*/().\d]+$/.test(s)) return null;
  try {
    const value = evaluate(s);
    if (!Number.isFinite(value)) return null;
    const milli = Math.round(value * 1000);
    if (Math.abs(milli) > MAX_AMOUNT) return null;
    return milli;
  } catch {
    return null;
  }
}

/** Tiny recursive-descent evaluator for + - * / and parentheses. */
function evaluate(expr: string): number {
  let i = 0;
  const peek = () => expr[i];
  const number = (): number => {
    if (peek() === '(') {
      i++;
      const v = add();
      if (peek() !== ')') throw new Error('paren');
      i++;
      return v;
    }
    if (peek() === '-') {
      i++;
      return -number();
    }
    if (peek() === '+') {
      i++;
      return number();
    }
    const start = i;
    while (i < expr.length && /[\d.]/.test(expr[i])) i++;
    if (start === i) throw new Error('num');
    return parseFloat(expr.slice(start, i));
  };
  const mul = (): number => {
    let v = number();
    while (peek() === '*' || peek() === '/') {
      const op = expr[i++];
      const r = number();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const add = (): number => {
    let v = mul();
    while (peek() === '+' || peek() === '-') {
      const op = expr[i++];
      const r = mul();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const v = add();
  if (i !== expr.length) throw new Error('trailing');
  return v;
}

/** Value for pre-filling a cents-style amount field, e.g. "45.50" (empty for zero, sign dropped). */
export function milliToInput(m: Milli, c: CurrencyFormat = active): string {
  if (!m) return '';
  return formatNumber(m, c);
}

/** Like milliToInput, but keeps the minus sign (for fields that can go negative, like Assigned). */
export function signedInput(m: Milli, c: CurrencyFormat = active): string {
  return m < 0 && milliToInput(m, c) ? `-${milliToInput(m, c)}` : milliToInput(m, c);
}
