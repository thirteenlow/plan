/**
 * Matching what an AI scan read (a category or account name) to the user's own categories and accounts.
 * Used by Scan receipt (where Claude picks from the user's names) and when importing shortcut scans (where it
 * could only suggest a general category like "Groceries").
 */
import { RTA, type BudgetData } from '@/store/types';

/** Categories you'd put spending in: visible, not Ready to Assign, not a credit card's payment category. */
export const spendingCategories = (data: BudgetData) => data.categories.filter((c) => !c.hidden && c.id !== RTA && !c.linkedAccountId);

/** The names sent with Scan receipt so Claude can pick from them (names only; no amounts). */
export function scanHints(data: BudgetData) {
  return {
    categories: spendingCategories(data).map((c) => c.name),
    accounts: data.accounts.filter((a) => a.onBudget && !a.closed).map((a) => a.name),
  };
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// General categories the shortcut scan suggests, and words that usually appear in people's own category names.
const SYNONYMS: Record<string, string[]> = {
  groceries: ['grocery', 'groceries', 'supermarket', 'food', 'household', 'market'],
  'dining out': ['dining', 'restaurant', 'restaurants', 'eating out', 'eat out', 'food', 'meals', 'cafe', 'coffee', 'takeaway'],
  transport: ['transport', 'transportation', 'commute', 'taxi', 'ride', 'grab', 'fuel', 'petrol', 'gas', 'car', 'parking', 'mrt', 'bus'],
  shopping: ['shopping', 'clothing', 'clothes', 'stuff', 'personal'],
  bills: ['bill', 'bills', 'utilities', 'utility', 'phone', 'internet', 'electricity', 'water', 'subscriptions', 'subscription'],
  entertainment: ['entertainment', 'fun', 'leisure', 'streaming', 'movies', 'games', 'hobbies'],
  health: ['health', 'medical', 'doctor', 'pharmacy', 'fitness', 'gym', 'wellness'],
  travel: ['travel', 'vacation', 'holiday', 'trip', 'flights', 'hotel'],
};

/** The best of your categories for a scanned category name, or null if nothing fits well. */
export function matchCategory(data: BudgetData, name: string | null | undefined): string | null {
  if (!name) return null;
  const cats = spendingCategories(data);
  const n = norm(name);
  if (!n) return null;
  const exact = cats.find((c) => norm(c.name) === n);
  if (exact) return exact.id;
  const partial = cats.find((c) => {
    const cn = norm(c.name);
    return cn.length > 2 && (cn.includes(n) || n.includes(cn));
  });
  if (partial) return partial.id;
  const words = SYNONYMS[n] ?? Object.entries(SYNONYMS).find(([, list]) => list.includes(n))?.[1];
  if (!words) return null;
  const bySynonym = cats.find((c) => {
    const cn = ` ${norm(c.name)} `;
    return words.some((w) => cn.includes(` ${w} `));
  });
  return bySynonym?.id ?? null;
}

// Words that vary between receipts of the same shop and say nothing about it.
const NOISE = new Set(['the', 'pte', 'ltd', 'inc', 'llc', 'co', 'corp', 'company', 'limited', 'sdn', 'bhd', 'gmbh', 'store', 'shop', 'outlet', 'branch']);
// Words too general to tie two shops together on their own ("Cafe" shouldn't match "Cafe Nero").
const GENERIC = new Set(['cafe', 'coffee', 'restaurant', 'bar', 'market', 'mart', 'food', 'foods', 'kitchen', 'bakery', 'pharmacy', 'station', 'hotel', 'taxi', 'parking', 'grocery', 'supermarket', 'pizza', 'sushi', 'noodle', 'noodles', 'chicken', 'burger']);

/** A merchant name reduced to the words that identify the shop ("STARBUCKS #1234 Pte Ltd" → "starbucks"). */
export const merchantKey = (name: string) =>
  norm(name)
    .split(' ')
    .filter((w) => w && !/\d/.test(w) && !NOISE.has(w))
    .join(' ');

/**
 * The category a merchant was last filed under, from a payee with the same or a close name: "Starbucks" matches
 * "STARBUCKS #1234" and "Starbucks Raffles Place". Null when there's no confident match.
 */
export function payeeCategory(data: BudgetData, merchant: string | null | undefined): string | null {
  if (!merchant) return null;
  const key = merchantKey(merchant);
  if (!key) return null;
  const valid = new Set(data.categories.map((c) => c.id));
  const known = data.payees.filter((p) => p.lastCategoryId && p.lastCategoryId !== RTA && valid.has(p.lastCategoryId));
  const exact = known.find((p) => p.name.toLowerCase() === merchant.toLowerCase()) ?? known.find((p) => merchantKey(p.name) === key);
  if (exact) return exact.lastCategoryId!;
  // One name starts with the other, word for word, and the shared part is distinctive enough (not just "the cafe").
  let best: { id: string; len: number } | null = null;
  for (const p of known) {
    const other = merchantKey(p.name);
    const [short, long] = other.length < key.length ? [other, key] : [key, other];
    if (short.length < 4 || GENERIC.has(short) || !`${long} `.startsWith(`${short} `)) continue;
    if (!best || short.length > best.len) best = { id: p.lastCategoryId!, len: short.length };
  }
  return best?.id ?? null;
}

/** The account a scanned card/bank/wallet name refers to (by name or last 4 digits), or null. */
export function matchAccount(data: BudgetData, name: string | null | undefined): string | null {
  if (!name) return null;
  const open = data.accounts.filter((a) => a.onBudget && !a.closed);
  const n = norm(name).replace(/ /g, '');
  const exact = open.find((a) => norm(a.name).replace(/ /g, '') === n);
  if (exact) return exact.id;
  const digits = name.match(/\d{4}/)?.[0];
  const hit = open.find((a) => {
    const an = norm(a.name).replace(/ /g, '');
    return (an.length > 2 && (n.includes(an) || an.includes(n))) || (!!digits && a.name.includes(digits));
  });
  return hit?.id ?? null;
}
