import type { Ionicons } from '@expo/vector-icons';
import type { AccountType } from '@/store/types';

export type IconName = keyof typeof Ionicons.glyphMap;

/** Gradient pairs for the round category badges (top-left → bottom-right). */
export const BADGE_GRADIENTS: [string, string][] = [
  ['#FFD45C', '#FFA931'], // amber
  ['#B86BFF', '#7B3FE4'], // violet
  ['#FF7A7A', '#E0393E'], // red
  ['#3FE0B4', '#12B58C'], // teal
  ['#5AB8FF', '#2F6BEA'], // blue
  ['#FF9BCB', '#F0569A'], // pink
  ['#8DE36B', '#3DB24F'], // green
  ['#FFB27A', '#FF7442'], // orange
];

const RULES: [RegExp, IconName][] = [
  [/rent|mortgage|home|house/i, 'home'],
  [/grocer|supermarket/i, 'cart'],
  [/dining|restaurant|food|eat|lunch|coffee|cafe/i, 'fast-food'],
  [/electric|utilit|power|gas bill|water/i, 'flash'],
  [/internet|wifi/i, 'wifi'],
  [/phone|mobile|recharge/i, 'phone-portrait'],
  [/car|auto|transport|fuel|gas|petrol|uber|taxi|transit/i, 'car'],
  [/insur/i, 'shield-checkmark'],
  [/medic|health|doctor|pharma|dental/i, 'medkit'],
  [/gym|fitness|sport/i, 'barbell'],
  [/vacation|travel|holiday|flight/i, 'airplane'],
  [/entertain|movie|game|fun|music|stream/i, 'film'],
  [/shop|cloth|apparel/i, 'bag-handle'],
  [/gift|christmas|birthday/i, 'gift'],
  [/pet|dog|cat|groom/i, 'paw'],
  [/emergency|rainy/i, 'umbrella'],
  [/saving|invest|retire/i, 'trending-up'],
  [/educat|school|tuition|book|course/i, 'school'],
  [/kid|child|baby/i, 'happy'],
  [/subscript|software|app/i, 'apps'],
  [/charity|donat|tithe/i, 'heart'],
  [/debt|loan|credit|card/i, 'card'],
  [/hair|beauty|personal|self/i, 'sparkles'],
  [/tax/i, 'document-text'],
  [/stuff|misc|other/i, 'cube'],
];

export function categoryIcon(name: string): IconName {
  for (const [re, icon] of RULES) if (re.test(name)) return icon;
  return 'pricetag';
}

export function hashIndex(s: string, n: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % n;
}

export const badgeGradient = (key: string) => BADGE_GRADIENTS[hashIndex(key, BADGE_GRADIENTS.length)];

export const ACCOUNT_TYPE_INFO: Record<AccountType, { label: string; icon: IconName; onBudget: boolean; debt: boolean; credit: boolean }> = {
  checking: { label: 'Checking', icon: 'wallet', onBudget: true, debt: false, credit: false },
  savings: { label: 'Savings', icon: 'cash', onBudget: true, debt: false, credit: false },
  cash: { label: 'Cash', icon: 'cash-outline', onBudget: true, debt: false, credit: false },
  creditCard: { label: 'Credit Card', icon: 'card', onBudget: true, debt: true, credit: true },
  lineOfCredit: { label: 'Line of Credit', icon: 'card-outline', onBudget: true, debt: true, credit: true },
  asset: { label: 'Asset (e.g. Investment)', icon: 'trending-up', onBudget: false, debt: false, credit: false },
  liability: { label: 'Liability', icon: 'trending-down', onBudget: false, debt: true, credit: false },
  mortgage: { label: 'Mortgage', icon: 'home', onBudget: false, debt: true, credit: false },
  loan: { label: 'Loan', icon: 'document-text', onBudget: false, debt: true, credit: false },
};

export const isCreditType = (t: AccountType) => ACCOUNT_TYPE_INFO[t].credit;

/** Account types that budget the same way (cash, credit, or tracking), so one can be switched to the other. */
export const sameAccountKind = (a: AccountType, b: AccountType) =>
  ACCOUNT_TYPE_INFO[a].onBudget === ACCOUNT_TYPE_INFO[b].onBudget && ACCOUNT_TYPE_INFO[a].credit === ACCOUNT_TYPE_INFO[b].credit;

export const ACCOUNT_GRADIENTS: Record<AccountType, [string, string]> = {
  checking: ['#5AB8FF', '#2F6BEA'],
  savings: ['#3FE0B4', '#12B58C'],
  cash: ['#FFD45C', '#FFA931'],
  creditCard: ['#B86BFF', '#7B3FE4'],
  lineOfCredit: ['#B86BFF', '#7B3FE4'],
  asset: ['#8DE36B', '#3DB24F'],
  liability: ['#FF7A7A', '#E0393E'],
  mortgage: ['#FFB27A', '#FF7442'],
  loan: ['#FF9BCB', '#F0569A'],
};
