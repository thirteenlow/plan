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
