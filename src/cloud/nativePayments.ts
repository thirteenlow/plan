/*
 * Android app: payment auto-log without MacroDroid. Plan's own notification listener keeps Google Wallet, Samsung
 * Wallet and SimplyGo (or any chosen app's) payment notifications on the phone, and this logs them. Nothing goes
 * to the server, so it works offline and without the inbox key.
 */
import PaymentNotifications, { type QueuedNotification } from '../../modules/payment-notifications';
import { useCloud } from '@/cloud/cloudStore';
import { accountForCard, inboxBudget, readUnclearWithAI, savePayments, type InboxRow } from '@/cloud/inbox';
import type { AutoLogSource } from '@/store/types';
import { listenerConfig, type Platform } from '@/utils/autoLogSources';
import { isAndroidDevice, isAppleDevice } from '@/utils/device';

export { PaymentNotifications };

/** True in the Android app (not the web or Expo Go), where Plan can read notifications itself. */
export const nativeAutoLog = () => !!PaymentNotifications;

/** Which kind of device this is, for what auto-log can do here and how it's set up. */
export const autoLogPlatform = (): Platform => (isAppleDevice() ? 'ios' : nativeAutoLog() ? 'android-app' : isAndroidDevice() ? 'android-web' : 'desktop');

/** SimplyGo's Android package, so it's found even if its name can't be read. */
const KNOWN_PACKAGES: Record<string, string> = { simplygo: 'sg.com.transitlink' };

/** The apps to listen to besides the wallets: each name, plus its package when known. */
export const appsToWatch = (names: string[]) => names.flatMap((n) => [n, KNOWN_PACKAGES[n.trim().toLowerCase()]]).filter((x): x is string => !!x);

/** Tells the Android listener which wallets and apps to read, from the budget's Auto-log sources. */
export function syncListener(sources: AutoLogSource[] | undefined) {
  if (!PaymentNotifications || !sources) return;
  const { wallets, apps } = listenerConfig(sources);
  PaymentNotifications.configure(wallets, appsToWatch(apps));
}

let importing = false;

/** Logs the payment notifications the phone kept, then removes them from its queue. Returns how many were logged. */
export async function importNativePayments(): Promise<number> {
  if (!PaymentNotifications || importing) return 0;
  const data = inboxBudget();
  // No budget or account yet: leave them waiting on the phone.
  if (!data || !accountForCard(data, null)) return 0;
  importing = true;
  try {
    const queued = PaymentNotifications.peek();
    if (!queued.length) return 0;
    // Same shape as a MacroDroid post, so the same reader picks out the amount, merchant and card.
    // Google Wallet's app is just called "Wallet" on the phone.
    const appName = (q: QueuedNotification) => (q.app === 'Wallet' ? 'Google Wallet' : q.app);
    const rows: InboxRow[] = queued.map((q) => ({ amount: q.text, merchant: q.title || appName(q), card: `${appName(q)}: ${q.text}`, created_at: new Date(q.postedAt).toISOString() }));
    // Ones Plan can't read itself may go to the AI (when signed in and the source allows it).
    const { imported, notes } = savePayments(data, await readUnclearWithAI(data, rows));
    PaymentNotifications.ack(queued[queued.length - 1].id);
    if (notes.length) useCloud.setState({ notice: notes.join(' ') });
    return imported;
  } finally {
    importing = false;
  }
}
