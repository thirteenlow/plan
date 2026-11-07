import type { AutoLogKind, AutoLogSource, BudgetData } from '@/store/types';
import { uid } from '@/utils/id';
import { sanitizeText } from '@/utils/validation';

/*
 * Auto-log sources: where automatic payments come from (Apple Pay, a wallet, an app's notifications, a bank's alert
 * emails), each with its own options. Payments are matched to a source by how they say where they came from (the
 * "via" name: "Apple Pay", "Google Wallet", the app's name, or the email source's name).
 */

export type Platform = 'ios' | 'android-app' | 'android-web' | 'desktop';

export type Preset = Omit<AutoLogSource, 'id' | 'enabled'> & { platforms: Platform[]; hint: string };

const PHONES: Platform[] = ['ios', 'android-app', 'android-web'];

export const PRESETS: Preset[] = [
  { kind: 'tap', name: 'Apple Pay', match: 'Apple Pay', platforms: ['ios'], hint: 'Every tap with your iPhone' },
  { kind: 'app', name: 'Wallet', match: 'Wallet', platforms: ['ios'], hint: 'Wallet’s payment alerts, with the shop’s name' },
  { kind: 'tap', name: 'Google Wallet', match: 'Google Wallet', platforms: ['android-app', 'android-web'], hint: 'Every tap with Google Wallet' },
  { kind: 'tap', name: 'Samsung Wallet', match: 'Samsung Wallet', platforms: ['android-app', 'android-web'], hint: 'Every tap with Samsung Wallet' },
  { kind: 'app', name: 'SimplyGo', match: 'SimplyGo', filter: 'Fare', platforms: PHONES, hint: 'Bus and train fares' },
  { kind: 'app', name: 'PayLah!', match: 'PayLah!', platforms: PHONES, hint: 'DBS PayLah! payments' },
  { kind: 'app', name: 'Grab', match: 'Grab', filter: 'has been charged', platforms: PHONES, hint: 'Rides, food and GrabPay' },
  { kind: 'app', name: 'YouTrip', match: 'YouTrip', platforms: PHONES, hint: 'Card payments abroad' },
  { kind: 'email', name: 'DBS PayLah! emails', match: 'DBS PayLah! emails', sender: 'paylah.alert@dbs.com', filter: 'Transaction Alerts', platforms: ['ios'], hint: 'Transaction Alerts emails' },
];

/**
 * Ready-made iPhone shortcuts (iCloud links, built with scripts/shortcuts/build.py and shared from an iPhone so they
 * keep their trigger). Adding one asks for the Plan key and sets up the whole automation. Keyed by preset name.
 */
export const SHORTCUT_LINKS: Record<string, string> = {
  'Apple Pay': 'https://www.icloud.com/shortcuts/21a0ef15589d4883a0849f419ce0d72e',
  Wallet: 'https://www.icloud.com/shortcuts/4eee7573f2854a33b0d98cf54f22c3e2',
  'DBS PayLah! emails': 'https://www.icloud.com/shortcuts/f323968a69834b7fa4398bcb57d9b376',
  Grab: 'https://www.icloud.com/shortcuts/ee98ff7c44f5467e9f9b2ed7860b14ab',
};

/**
 * Any other app's notifications: asks for the key and the app's name. It comes set to YouTrip, so for another app the
 * user picks theirs in the trigger.
 */
export const APP_ALERTS_LINK = 'https://www.icloud.com/shortcuts/dbc90ab9c0d1466eb1d374ef058ab2f5';
export const APP_ALERTS_PRESET_APP = 'YouTrip';

/** Any other bank's alert emails: asks for the key and the source's name; the user sets the sender after adding it. */
export const BANK_EMAILS_LINK = 'https://www.icloud.com/shortcuts/11671290970c49999dca0b5452a90a0f';
export const BANK_EMAILS_PRESET_SENDER = 'sender@bank.com';

/** Ready-made Scan Payment shortcut (no trigger: Back Tap or the Action Button runs it). */
export const SCAN_SHORTCUT_LINK = 'https://www.icloud.com/shortcuts/41dba39f41b6456fa88d2f59a0e38460';

/** The ready-made shortcut for a source, if there is one (matched by what its payments say they came from). */
export const shortcutFor = (source: Pick<AutoLogSource, 'match'>) => Object.entries(SHORTCUT_LINKS).find(([name]) => name.toLowerCase() === source.match.trim().toLowerCase())?.[1];

export const KIND_LABEL: Record<AutoLogKind, string> = { tap: 'Tap to pay', app: 'App notifications', email: 'Email alerts' };
export const KIND_ICON: Record<AutoLogKind, 'phone-portrait-outline' | 'notifications-outline' | 'mail-outline'> = { tap: 'phone-portrait-outline', app: 'notifications-outline', email: 'mail-outline' };

export const presetsFor = (platform: Platform) => PRESETS.filter((p) => platform === 'desktop' || p.platforms.includes(platform));

export function newSource(p: Omit<Preset, 'platforms' | 'hint'>): AutoLogSource {
  const name = sanitizeText(p.name, 40) || 'Payments';
  return { id: uid('src'), kind: p.kind, name, match: sanitizeText(p.match, 40) || name, enabled: true, ...(p.sender ? { sender: p.sender } : {}), ...(p.filter ? { filter: p.filter } : {}) };
}

/** The source's filter words: its own, else its preset's (sources added before filters existed), else none. */
export function filterOf(source: Pick<AutoLogSource, 'kind' | 'match' | 'filter'>): string {
  if (source.filter !== undefined) return source.filter.trim();
  return PRESETS.find((p) => p.kind === source.kind && p.match.toLowerCase() === source.match.toLowerCase())?.filter ?? '';
}

/** An app notification passes the source's filter: it has the words (any case), or there are none. */
export function passesFilter(source: Pick<AutoLogSource, 'kind' | 'match' | 'filter'>, text: string): boolean {
  const words = filterOf(source);
  return source.kind !== 'app' || !words || text.toLowerCase().includes(words.toLowerCase());
}

/** What a phone starts with the first time the Auto-log screen opens. */
export function defaultSources(platform: Platform): AutoLogSource[] {
  const names = platform === 'ios' ? ['Apple Pay', 'SimplyGo'] : platform === 'desktop' ? [] : ['Google Wallet', 'Samsung Wallet', 'SimplyGo'];
  return PRESETS.filter((p) => names.includes(p.name)).map(newSource);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The source a payment came from, by its "via" name (exact, or containing the source's name). */
export function sourceFor(sources: AutoLogSource[] | undefined, via: string): AutoLogSource | undefined {
  if (!sources?.length || !via) return undefined;
  const v = norm(via);
  return sources.find((s) => norm(s.match) === v) ?? sources.find((s) => norm(s.match).length >= 3 && v.includes(norm(s.match)));
}

/** The Android app's listener settings for these sources: whether to read the wallets, and which apps. */
export function listenerConfig(sources: AutoLogSource[] | undefined): { wallets: boolean; apps: string[] } {
  const on = (sources ?? []).filter((s) => s.enabled);
  return { wallets: on.some((s) => s.kind === 'tap' && /google|samsung/i.test(s.match)), apps: on.filter((s) => s.kind === 'app').map((s) => s.match) };
}

/** The most recent payment logged from a source (its memo starts with the source's "via" name). */
export function lastCaught(data: BudgetData, source: AutoLogSource) {
  const v = norm(source.match);
  let best: BudgetData['transactions'][number] | undefined;
  for (const t of data.transactions) {
    if (!t.memo || !norm(t.memo.split(' · ')[0]).startsWith(v)) continue;
    if (!best || t.date > best.date || (t.date === best.date && t.id > best.id)) best = t;
  }
  return best;
}
