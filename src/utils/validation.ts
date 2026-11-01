import type { BudgetData, CurrencyFormat, Milli } from '@/store/types';
import { MAX_AMOUNT } from './money';

/**
 * Input sanitising and validation.
 *
 * Plan stores everything as JSON on the device (no SQL, no server, no HTML rendering), so classic
 * SQL injection / XSS don't apply. What does matter: malformed numbers, invisible or control
 * characters, absurdly long strings and corrupted saved data. Every user-entered value goes through
 * these helpers in the UI, and the store re-checks before saving.
 */

export const LIMITS = {
  budgetName: 50,
  ownerName: 40,
  accountName: 50,
  categoryName: 50,
  groupName: 50,
  payeeName: 100,
  memo: 200,
  note: 500,
  search: 60,
  symbol: 4,
  amountChars: 20,
} as const;

// Control characters (except tab/newline), zero-width and bidi-override characters.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const INVISIBLE = /[​-‏‪-‮⁠-⁩﻿]/g;

/** While typing: drop control/invisible characters and cap the length (keeps spaces as typed). */
export function cleanTyping(text: string, max: number, multiline = false): string {
  let s = text.replace(CONTROL, '').replace(INVISIBLE, '');
  if (!multiline) s = s.replace(/[\r\n\t]+/g, ' ');
  return s.slice(0, max);
}

/** Before saving: clean, collapse whitespace, trim. */
export function sanitizeText(text: string | undefined | null, max: number, multiline = false): string {
  if (typeof text !== 'string') return '';
  let s = cleanTyping(text, max * 2, multiline);
  s = multiline ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : s.replace(/\s+/g, ' ');
  return s.trim().slice(0, max);
}

/** Returns an error message, or null when the name is acceptable. */
export function validateName(name: string, opts: { label: string; max: number; existing?: string[]; current?: string }): string | null {
  const clean = sanitizeText(name, opts.max);
  if (!clean) return `${opts.label} can’t be empty.`;
  if (name.trim().length > opts.max) return `${opts.label} must be ${opts.max} characters or fewer.`;
  if (!/[\p{L}\p{N}]/u.test(clean)) return `${opts.label} needs at least one letter or number.`;
  const lower = clean.toLowerCase();
  if (opts.existing?.some((e) => e.toLowerCase() === lower && e.toLowerCase() !== opts.current?.toLowerCase())) {
    const noun = opts.label.toLowerCase();
    return `${/^[aeiou]/.test(noun) ? 'An' : 'A'} ${noun} called “${clean}” already exists.`;
  }
  return null;
}

/**
 * Cents-style ("ATM") amount entry: digits shift in from the right, so typing 1 → 0.01, then 0 → 0.10,
 * then 0 → 1.00. Any other character is ignored. The result is grouped and uses the budget's decimal mark,
 * and is capped so it can never exceed MAX_AMOUNT. With `allowNegative`, typing "-" makes it negative.
 */
export function filterAmountTyping(text: string, c: CurrencyFormat, opts: { allowNegative?: boolean } = {}): string {
  const decimals = Math.max(0, c.decimals);
  const negative = !!opts.allowNegative && text.includes('-');
  const digits = text
    .replace(/\D/g, '')
    .replace(/^0+/, '')
    .slice(0, 9 + decimals);
  if (!digits) return negative ? '-' : '';
  const padded = digits.padStart(decimals + 1, '0');
  const int = padded.slice(0, padded.length - decimals).replace(/\B(?=(\d{3})+(?!\d))/g, c.group);
  const frac = padded.slice(padded.length - decimals);
  return (negative ? '-' : '') + int + (decimals ? c.decimal + frac : '');
}

/** Checks a parsed amount. Returns an error message, or null when acceptable. */
export function validateAmount(m: Milli | null, opts: { allowZero?: boolean; allowNegative?: boolean; label?: string } = {}): string | null {
  const label = opts.label ?? 'Amount';
  if (m === null || !Number.isFinite(m)) return `${label} isn’t a valid number.`;
  if (!Number.isSafeInteger(m)) return `${label} isn’t a valid number.`;
  if (Math.abs(m) > MAX_AMOUNT) return `${label} is too large.`;
  if (!opts.allowZero && m === 0) return `${label} can’t be zero.`;
  if (!opts.allowNegative && m < 0) return `${label} can’t be negative.`;
  return null;
}

/** True when a value is a whole number of milliunits within the app's limits (used by the store). */
export const isSafeAmount = (m: unknown): m is Milli => typeof m === 'number' && Number.isSafeInteger(m) && Math.abs(m) <= MAX_AMOUNT;

/** Currency symbols: no digits or separators (they'd break parsing), short. */
export function cleanSymbol(text: string): string {
  return cleanTyping(text, LIMITS.symbol).replace(/[\d.,+\-*/()'\s]/g, '');
}

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const isISODate = (d: unknown): d is string => typeof d === 'string' && ISO_DATE.test(d);

/**
 * Structural check for budgets loaded from storage or imported from a file.
 * Corrupt or tampered data is rejected instead of crashing the app.
 */
export function isValidBudget(b: unknown): b is BudgetData {
  if (!b || typeof b !== 'object') return false;
  const x = b as Record<string, unknown>;
  const arrays = ['accounts', 'groups', 'categories', 'payees', 'transactions', 'scheduled'];
  if (typeof x.id !== 'string' || typeof x.name !== 'string') return false;
  if (!arrays.every((k) => Array.isArray(x[k]))) return false;
  if (!x.assigned || typeof x.assigned !== 'object') return false;
  const settings = x.settings as Record<string, unknown> | undefined;
  const currency = settings?.currency as Record<string, unknown> | undefined;
  if (!currency || typeof currency.symbol !== 'string' || typeof currency.decimals !== 'number') return false;
  const txs = x.transactions as Record<string, unknown>[];
  return txs.every((t) => t && typeof t.id === 'string' && typeof t.accountId === 'string' && isISODate(t.date) && isSafeAmount(t.amount));
}

/** Receipt photo ids look like "ph…" (lowercase letters/digits). */
export const isPhotoId = (id: unknown): id is string => typeof id === 'string' && /^ph[a-z0-9]+$/.test(id) && id.length < 40;
