/**
 * Web push for the installed web app: permission, the service worker (public/sw.js) and the push
 * subscription, which is saved to the server so send-reminders can reach this browser.
 * iPhone/iPad only support web push from iOS 16.4, and only once Plan is added to the Home Screen.
 */
import { getSupabase } from '@/cloud/supabase';
import type { CurrencyFormat } from '@/store/types';

export type PushStatus = 'unsupported' | 'needsInstall' | 'denied' | 'off' | 'on';

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';

const isIOS = () => typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1));
const standalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);
const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Notifications are switched on for the server too (a key is configured). */
export const pushConfigured = () => VAPID_PUBLIC_KEY.length > 20;

async function registration() {
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function pushStatus(): Promise<PushStatus> {
  if (!supported()) return isIOS() && !standalone() ? 'needsInstall' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}

const toKey = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Asks permission, subscribes this browser and saves the subscription to the account. */
export async function enablePush(): Promise<PushStatus> {
  if (!supported()) return pushStatus();
  if (!pushConfigured()) throw new Error('Notifications aren’t set up on this site yet.');
  const sb = getSupabase();
  if (!sb) throw new Error('Sign in first.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { error } = await sb.rpc('save_push_subscription', { p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth });
  if (error) throw /function .* does not exist|Could not find the function/i.test(error.message) ? new Error('Run supabase/006_reminders.sql in your Supabase project first.') : error;
  return 'on';
}

export async function disablePush() {
  if (!supported()) return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await getSupabase()?.rpc('remove_push_subscription', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

/**
 * Tells the server this device's choices for instant "payment logged" notifications, and how to write money in
 * them (Apple Pay sends a bare number, and the server can't read the budget's currency).
 */
export async function syncPushPrefs(logged: boolean, details: boolean, currency?: CurrencyFormat) {
  if (!supported() || Notification.permission !== 'granted') return;
  const sub = await (await navigator.serviceWorker.getRegistration('/'))?.pushManager.getSubscription();
  const sb = getSupabase();
  if (!sub || !sb) return;
  const base = { p_endpoint: sub.endpoint, p_logged: logged, p_details: details };
  const fmt = currency && { symbol: currency.symbol, decimals: currency.decimals, symbolFirst: currency.symbolFirst, group: currency.group, decimal: currency.decimal, showSymbol: currency.showSymbol !== false };
  let { error } = await sb.rpc('set_push_prefs', fmt ? { ...base, p_currency: fmt } : base);
  // 011_push_currency.sql not run yet: save the rest without the currency.
  if (error && fmt && /Could not find the function|does not exist/i.test(error.message)) ({ error } = await sb.rpc('set_push_prefs', base));
  if (error && !/function .* does not exist|Could not find the function/i.test(error.message)) console.warn('[push] prefs', error.message);
}

/** Shows a notification right away from this device (checks permission and how it looks; no server involved). */
export async function showTestNotification(title: string, body: string) {
  const reg = await registration();
  await navigator.serviceWorker.ready;
  await reg.showNotification(title, { body, icon: '/logo192.png', data: { url: '/' } });
}
