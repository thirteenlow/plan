/**
 * Tap-to-pay auto-logging. On iPhone a Shortcuts automation ("When I tap a Wallet card") posts each Apple Pay
 * payment to log_payment() with the user's personal inbox key; on Android MacroDroid forwards Google / Samsung
 * Wallet's payment notification the same way (see walletNotification.ts). The app claims waiting payments on
 * every sync and saves them into the active budget as unapproved transactions to review.
 * Server side: supabase/003_payment_inbox.sql.
 */
import { randomToken, sha256Hex } from '@/security/crypto';
import { secretStore } from '@/security/deviceKey';
import { useStore } from '@/store/store';
import type { BudgetData } from '@/store/types';
import { parseAmountText } from '@/utils/budgetCsv';
import { addDays } from '@/utils/date';
import { readWalletPayment } from '@/utils/walletNotification';
import { matchAccount, matchCategory, payeeCategory } from '@/utils/scanMatch';
import { isCreditType } from '@/utils/icons';
import { useCloud } from './cloudStore';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { getSupabase } from './supabase';

/** Card name the scan-payment function gives payments it read from a screenshot. */
export const SCREENSHOT_CARD = 'Screenshot';

/** Merchant name used by the in-app "Send a test" button; imported as a check, never as a transaction. */
export const TEST_MERCHANT = 'Plan connection test';

const keyName = (uid: string) => `plan.inboxKey.${uid}`;

/**
 * MacroDroid's request body for Android: the notification as it came, read by readWalletPayment on import.
 * The braces are MacroDroid magic text from its Notification trigger.
 */
export const walletNotificationBody = (token: string) => `{"token":"${token}","amount":"{notification}","merchant":"{not_title}","card":"{not_app_name}: {notification}"}`;

/**
 * MacroDroid's body for one app's payment notifications (e.g. SimplyGo fares): like walletNotificationBody, but the
 * merchant is the app's name, since the title is something like "Trip Fare Alert".
 */
export const appNotificationBody = (token: string, app: string) => JSON.stringify({ token, amount: '{notification}', merchant: app, card: '{not_app_name}: {notification}' });

/** The address the Shortcut posts to (the publishable key rides along, as for any app request). */
export const logPaymentUrl = () => `${SUPABASE_URL}/rest/v1/rpc/log_payment?apikey=${encodeURIComponent(SUPABASE_ANON_KEY)}`;

/** Where the Scan Payment Shortcut posts its screenshot (supabase/functions/scan-payment). */
export const scanPaymentUrl = () => `${SUPABASE_URL}/functions/v1/scan-payment`;

const userId = () => {
  const id = useCloud.getState().user?.id;
  if (!id) throw new Error('Sign in first.');
  return id;
};

/** This device's copy of the inbox key, if auto-logging was set up here. */
export const getInboxKey = async () => (await secretStore.get(keyName(userId()))) ?? null;

/** Makes a new key (replacing any old one, which stops working) and keeps it on this device. */
export async function createInboxKey(): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud sync isn’t set up.');
  const token = randomToken(32);
  const { error } = await sb.rpc('set_inbox_key', { p_hash: sha256Hex(token) });
  if (error) throw /function .* does not exist|Could not find the function/i.test(error.message) ? new Error('Run supabase/003_payment_inbox.sql in your Supabase project first.') : error;
  await secretStore.set(keyName(userId()), token);
  return token;
}

/** Turns auto-logging off: the key stops working and anything still waiting is deleted. */
export async function removeInboxKey() {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.rpc('remove_inbox_key');
  if (error) throw error;
  await secretStore.remove(keyName(userId()));
}

/** Posts a test payment exactly the way the Shortcut does, so a successful test proves the setup. */
export async function sendTestPayment(token: string) {
  const res = await fetch(logPaymentUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, amount: '0.01', merchant: TEST_MERCHANT, card: 'Test' }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      /pro required/i.test(text) ? 'Auto-logging needs Plan Pro.' : /invalid key/i.test(text) ? 'Key not accepted. Make a new one and update your automation.' : `The server said no (${res.status}).`,
    );
  }
}

/**
 * Sends a screenshot the same way the Scan Payment Shortcut does. On success the payment waits in the inbox
 * like any other; returns what was read.
 */
export async function scanScreenshot(token: string, image: { uri: string; name: string; type: string; file?: Blob }) {
  const form = new FormData();
  form.append('token', token);
  // Web hands us a File; native FormData takes { uri, name, type }.
  form.append('image', (image.file ?? image) as unknown as Blob, image.name);
  const res = await fetch(scanPaymentUrl(), { method: 'POST', body: form });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    amount?: string;
    merchant?: string | null;
    currency?: string;
    usage?: { model: string; input_tokens: number; output_tokens: number };
  };
  if (res.status === 404) throw new Error('The scan-payment function isn’t deployed yet.');
  if (!res.ok) throw new Error(body.error ?? `The server said no (${res.status}).`);
  return body;
}

/**
 * The Add transaction screen's "Scan receipt": reads a photo or screenshot (a JPEG data URL) and returns what it
 * found, without logging anything. Creates this device's key the first time.
 */
export type ReceiptRead = { amount: string; merchant: string | null; currency: string; date: string | null; category: string | null; account: string | null };

/** `hints`: the names of the user's categories and accounts, so the AI picks from them (see scanHints). */
export async function readReceipt(dataUrl: string, hints?: { categories: string[]; accounts: string[] }): Promise<ReceiptRead> {
  const token = (await getInboxKey()) ?? (await createInboxKey());
  const res = await fetch(scanPaymentUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, image: dataUrl, mode: 'read', ...hints }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & Partial<Record<keyof ReceiptRead, string | null>>;
  if (res.status === 404) throw new Error('Receipt scanning isn’t set up on the server yet.');
  if (!res.ok || !body.amount) throw new Error(body.error ?? `The server said no (${res.status}).`);
  return { amount: body.amount, merchant: body.merchant ?? null, currency: body.currency ?? '', date: body.date ?? null, category: body.category ?? null, account: body.account ?? null };
}

/** Picks the account for a Wallet card: a name match, then the chosen default, then the first card/checking account. */
export function accountForCard(data: BudgetData, card: string | null): string | undefined {
  const open = data.accounts.filter((a) => !a.closed && a.onBudget);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const c = card ? norm(card) : '';
  const digits = card?.match(/\d{4}/)?.[0];
  const byName = c ? open.find((a) => norm(a.name) && (c.includes(norm(a.name)) || norm(a.name).includes(c) || (!!digits && a.name.includes(digits)))) : undefined;
  return byName?.id ?? (open.some((a) => a.id === data.settings.payAccountId) ? data.settings.payAccountId : undefined) ?? (open.find((a) => isCreditType(a.type)) ?? open[0])?.id;
}

let importing = false;

// Opened from a "Payment logged" notification (?logged=1): a payment should be waiting. If none is, say so,
// since another device with Plan open most likely took it first.
let expectingSince = 0;
if (typeof window !== 'undefined' && typeof window.location?.search === 'string' && /[?&]logged=1\b/.test(window.location.search)) {
  expectingSince = Date.now();
  const url = new URL(window.location.href);
  url.searchParams.delete('logged');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

/**
 * The budget automatic payments go into: the one Apple Pay was set up in (it has a "Log to" account), so they
 * don't land in whichever budget happens to be open, e.g. the demo. Otherwise the open budget.
 */
function inboxBudget(): BudgetData | undefined {
  const { budgets, activeBudgetId } = useStore.getState();
  const active = activeBudgetId ? budgets[activeBudgetId] : undefined;
  const hasPayAccount = (b: BudgetData) => !!b.settings.payAccountId && b.accounts.some((a) => a.id === b.settings.payAccountId && !a.closed);
  if (active && hasPayAccount(active)) return active;
  const configured = Object.values(budgets)
    .filter(hasPayAccount)
    .sort((a, b) => (a.lastOpenedAt < b.lastOpenedAt ? 1 : -1))[0];
  return configured ?? active;
}

/**
 * Claims everything waiting in the inbox and saves it as unapproved spending (category from the merchant's last
 * use) in the Apple Pay budget. Returns how many were imported, whether a test arrived, and how many rows came.
 */
export async function importPayments(): Promise<{ imported: number; tests: number; claimed: number }> {
  const sb = getSupabase();
  const data = inboxBudget();
  if (!sb || !data || importing) return { imported: 0, tests: 0, claimed: 0 };
  importing = true;
  try {
    const { data: rows, error } = await sb.rpc('claim_payments');
    if (error) {
      // Not set up on the server yet: nothing to import.
      if (/function .* does not exist|Could not find the function/i.test(error.message)) return { imported: 0, tests: 0, claimed: 0 };
      throw error;
    }
    let imported = 0;
    let tests = 0;
    // Rows are already off the server once claimed, so never drop one silently.
    let unreadable = 0;
    let noAccount = 0;
    type Row = { amount: string; merchant: string | null; card: string | null; created_at: string; category?: string | null; paid_on?: string | null; source?: string | null };
    for (const row of (rows ?? []) as Row[]) {
      if (row.merchant === TEST_MERCHANT) {
        tests++;
        continue;
      }
      // Android: a wallet notification forwarded whole, to pick the amount, merchant and card out of.
      const wallet = readWalletPayment(row);
      // A free trip ("Fare $0.00 - …", e.g. a transfer): nothing was spent, so nothing to log.
      if (wallet && !wallet.amount && /(?:^|[^\d.,])0[.,]00(?!\d)/.test(row.card ?? '')) continue;
      const amount = wallet ? wallet.amount : Math.abs(parseAmountText(row.amount));
      const scanned = row.source === 'screenshot' || row.card === SCREENSHOT_CARD;
      const cardName = wallet ? wallet.card : row.card === SCREENSHOT_CARD ? null : row.card;
      // Scans: the account the AI saw on screen if it matches one; otherwise the usual default.
      const accountId = (scanned ? matchAccount(data, cardName) : null) ?? accountForCard(data, scanned ? null : cardName);
      if (!accountId) {
        noAccount++;
        continue;
      }
      // An amount we can't read is still logged (at 0, with what came through) so it can be fixed in Spending.
      if (!amount) unreadable++;
      const when = new Date(row.created_at);
      const created = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`;
      // The date on the receipt, if it's believable (not in the future, not more than 60 days back).
      const date = row.paid_on && row.paid_on <= created && row.paid_on >= addDays(created, -60) ? row.paid_on : created;
      const via = wallet?.wallet ?? 'Apple Pay';
      const merchant = (wallet ? wallet.merchant : row.merchant?.trim()) || (scanned ? 'Payment' : via);
      // Category: what this merchant (or one with a close name) was last filed under; otherwise the scan's
      // suggestion matched to your categories.
      const known = payeeCategory(useStore.getState().budgets[data.id] ?? data, merchant);
      useStore.getState().saveTransaction(
        {
          accountId,
          date,
          amount: amount ? -amount : 0,
          payeeName: merchant,
          categoryId: known ?? (scanned ? matchCategory(data, row.category) : null),
          memo: [scanned ? 'From screenshot' : cardName ? `${via} · ${cardName}` : via, wallet?.note ?? '', !amount ? `amount unreadable: “${String((wallet ? row.card?.slice(row.card.indexOf(':') + 2) : row.amount) ?? '').slice(0, 40)}”` : ''].filter(Boolean).join(' · '),
          cleared: 'uncleared',
          approved: false,
        },
        data.id,
      );
      imported++;
    }
    const notes = [
      imported ? `Logged ${imported} ${imported === 1 ? 'payment' : 'payments'} automatically${data.id !== useStore.getState().activeBudgetId ? ` in “${data.name}”` : ''}. Review ${imported === 1 ? 'it' : 'them'} in Spending.` : '',
      unreadable ? `${unreadable === 1 ? 'One amount' : `${unreadable} amounts`} couldn’t be read, so ${unreadable === 1 ? 'it was' : 'they were'} logged as 0.` : '',
      noAccount ? `${noAccount} ${noAccount === 1 ? 'payment' : 'payments'} couldn’t be logged: add an account first.` : '',
    ].filter(Boolean);
    if (notes.length) useCloud.setState({ notice: notes.join(' ') });
    if (expectingSince && Date.now() - expectingSince < 120_000) {
      if (!(rows ?? []).length) notes.push('Nothing new here. Another device may have logged it; it’ll appear after syncing.');
      expectingSince = 0;
      if (notes.length) useCloud.setState({ notice: notes.join(' ') });
    }
    return { imported, tests, claimed: (rows ?? []).length };
  } finally {
    importing = false;
  }
}
