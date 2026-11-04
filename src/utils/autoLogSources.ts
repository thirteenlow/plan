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
  { kind: 'tap', name: 'Google Wallet', match: 'Google Wallet', platforms: ['android-app', 'android-web'], hint: 'Every tap with Google Wallet' },
  { kind: 'tap', name: 'Samsung Wallet', match: 'Samsung Wallet', platforms: ['android-app', 'android-web'], hint: 'Every tap with Samsung Wallet' },
  { kind: 'app', name: 'SimplyGo', match: 'SimplyGo', platforms: PHONES, hint: 'Bus and train fares' },
  { kind: 'app', name: 'PayLah!', match: 'PayLah!', platforms: PHONES, hint: 'DBS PayLah! payments' },
  { kind: 'app', name: 'Grab', match: 'Grab', platforms: PHONES, hint: 'Rides, food and GrabPay' },
  { kind: 'app', name: 'YouTrip', match: 'YouTrip', platforms: PHONES, hint: 'Card payments abroad' },
  { kind: 'email', name: 'DBS PayLah! emails', match: 'DBS PayLah! emails', sender: 'paylah.alert@dbs.com', platforms: ['ios'], hint: 'Transaction Alerts emails' },
];

export const KIND_LABEL: Record<AutoLogKind, string> = { tap: 'Tap to pay', app: 'App notifications', email: 'Email alerts' };
export const KIND_ICON: Record<AutoLogKind, 'phone-portrait-outline' | 'notifications-outline' | 'mail-outline'> = { tap: 'phone-portrait-outline', app: 'notifications-outline', email: 'mail-outline' };

export const presetsFor = (platform: Platform) => PRESETS.filter((p) => platform === 'desktop' || p.platforms.includes(platform));

export function newSource(p: Omit<Preset, 'platforms' | 'hint'>): AutoLogSource {
  const name = sanitizeText(p.name, 40) || 'Payments';
  return { id: uid('src'), kind: p.kind, name, match: sanitizeText(p.match, 40) || name, enabled: true, ...(p.sender ? { sender: p.sender } : {}) };
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
