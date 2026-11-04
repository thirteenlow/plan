/**
 * Plan Pro: who has it (from the server's my_plan(), see supabase/005_pro.sql and 007_stripe_trial.sql), what it
 * unlocks, and the paywall. Pro comes from a Stripe subscription, a trial the user starts themselves, or a row
 * added by hand in pro_members. The server enforces it for automation and invites; the app gates the rest.
 */
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { useStore } from '@/store/store';
import type { PetKind } from '@/store/types';
import { getSupabase } from './supabase';

export type PlanTier = 'free' | 'trial' | 'pro';

export const usePlan = create<{ plan: PlanTier; expiresAt: string | null; trialAvailable: boolean; managed: boolean; loaded: boolean }>(() => ({
  plan: 'free',
  expiresAt: null,
  trialAvailable: false,
  managed: false,
  loaded: false,
}));

export const useIsPro = () => usePlan((s) => s.plan !== 'free');
export const isPro = () => usePlan.getState().plan !== 'free';

/** Asks the server for this account's plan. Signed out, offline or not set up yet: free. */
export async function refreshPlan() {
  const sb = getSupabase();
  const { data: session } = sb ? await sb.auth.getSession() : { data: { session: null } };
  if (!sb || !session.session) return usePlan.setState({ plan: 'free', expiresAt: null, trialAvailable: false, managed: false, loaded: true });
  const { data, error } = await sb.rpc('my_plan');
  if (error) {
    // 005_pro.sql not run yet: everyone is free.
    if (!/function .* does not exist|Could not find the function/i.test(error.message)) console.warn('[plan] my_plan', error.message);
    return usePlan.setState({ loaded: true });
  }
  const row = data as { plan?: PlanTier; expires_at?: string | null; trial_available?: boolean; managed?: boolean } | null;
  usePlan.setState({
    plan: row?.plan === 'pro' || row?.plan === 'trial' ? row.plan : 'free',
    expiresAt: row?.expires_at ?? null,
    trialAvailable: !!row?.trial_available,
    managed: !!row?.managed,
    loaded: true,
  });
}

/** Starts the user's one free trial (they choose to; no card needed). */
export async function startTrial() {
  const sb = getSupabase();
  if (!sb) throw new Error('Sign in first.');
  const { error } = await sb.rpc('start_trial');
  if (error) throw new Error(/already used/i.test(error.message) ? 'You’ve already had your free trial.' : /does not exist|Could not find/i.test(error.message) ? 'Trials aren’t set up yet.' : error.message);
  await refreshPlan();
}

/** Stripe's publishable key (pk_…): turns on the payment form inside the app on the web. Safe to ship. */
export const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
export const canEmbedCheckout = () => Platform.OS === 'web' && STRIPE_PUBLISHABLE_KEY.startsWith('pk_');

type StripeReply = {
  url?: string;
  clientSecret?: string;
  subscribed?: boolean;
  cancelAtPeriodEnd?: boolean;
  periodEnd?: string | null;
  interval?: string | null;
  amount?: number | null;
  currency?: string | null;
};

async function callStripe(body: Record<string, string>): Promise<StripeReply> {
  const sb = getSupabase();
  if (!sb) throw new Error('Sign in first.');
  // On the web, Stripe sends people back to this same site (the server only allows ours or localhost).
  const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
  const { data, error } = await sb.functions.invoke('stripe-checkout', { body: { ...body, ...(origin ? { origin } : {}) } });
  if (error) {
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error((detail as { error?: string } | null)?.error ?? 'Payments aren’t available right now.');
  }
  return (data ?? {}) as StripeReply;
}

async function stripeUrl(body: Record<string, string>) {
  const { url } = await callStripe(body);
  if (!url) throw new Error('Payments aren’t available right now.');
  return url;
}

/** Thrown when the server can only offer Stripe's own page: the caller should go there instead. */
export class CheckoutRedirect extends Error {
  constructor(public url: string) {
    super('Continue on Stripe');
  }
}

/** Client secret for the in-app (embedded) payment form. */
export async function embeddedClientSecret(period: 'monthly' | 'yearly') {
  const { clientSecret, url } = await callStripe({ action: 'embedded', plan: period });
  if (clientSecret) return clientSecret;
  // An older stripe-checkout function returns a hosted page instead.
  if (url) throw new CheckoutRedirect(url);
  throw new Error('Payments aren’t available right now.');
}

/** Sends the user to a Stripe page (see go()). */
export const openStripePage = (url: string) => go(url);

/** Sends the user to Stripe: on the web in the same tab (Stripe sends them back to /pro), in an in-app browser on a phone. */
async function go(url: string) {
  if (Platform.OS === 'web') {
    window.location.assign(url);
    return;
  }
  await WebBrowser.openBrowserAsync(url);
  await refreshPlan();
}

/** Opens Stripe Checkout for the chosen billing period. */
export async function startCheckout(period: 'monthly' | 'yearly') {
  await go(await stripeUrl({ action: 'checkout', plan: period }));
}

/** Opens Stripe's billing page (change plan, update card, invoices). */
export async function openBillingPortal() {
  await go(await stripeUrl({ action: 'portal' }));
}

export type SubscriptionState = {
  subscribed: boolean;
  cancelAtPeriodEnd: boolean;
  /** When the current paid period ends: the renewal date, or the last day of Pro after cancelling */
  periodEnd: string | null;
  /** e.g. "S$4.98 a month" */
  priceLabel: string | null;
};

function priceLabel(r: StripeReply): string | null {
  if (r.amount == null || !r.currency) return null;
  const code = r.currency.toUpperCase();
  // S$ to match the prices on the paywall; other currencies use the browser's format.
  const money = code === 'SGD' ? `S$${(r.amount / 100).toFixed(2)}` : new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(r.amount / 100);
  return r.interval === 'year' ? `${money} a year` : r.interval === 'month' ? `${money} a month` : money;
}

const toState = (r: StripeReply): SubscriptionState => ({ subscribed: !!r.subscribed, cancelAtPeriodEnd: !!r.cancelAtPeriodEnd, periodEnd: r.periodEnd ?? null, priceLabel: priceLabel(r) });

/** The Stripe subscription behind this account's Pro (renewal date, pending cancellation). */
export async function subscriptionState() {
  return toState(await callStripe({ action: 'status' }));
}

/** Why people cancel (sent to Stripe as cancellation feedback). */
export const CANCEL_REASONS = [
  { key: 'too_expensive', label: 'Too expensive' },
  { key: 'unused', label: 'Not using it enough' },
  { key: 'missing_features', label: 'Missing a feature' },
  { key: 'switched_service', label: 'Switching apps' },
  { key: 'other', label: 'Something else' },
] as const;

/** Cancels at the end of the paid period, right from Plan. Pro stays on until then. */
export async function cancelSubscription(reason?: string, comment?: string) {
  const state = toState(await callStripe({ action: 'cancel', ...(reason ? { reason } : {}), ...(comment ? { comment } : {}) }));
  await refreshPlan();
  return state;
}

/**
 * Before deleting the account: stop the Stripe subscription renewing (Pro stays on until the paid period ends).
 * Throws if it couldn't be cancelled, so an account is never deleted while it's still being charged.
 */
export async function cancelBeforeDeleting() {
  const { plan, managed } = usePlan.getState();
  if (plan !== 'pro' && !managed) return;
  try {
    await callStripe({ action: 'cancel', reason: 'other', comment: 'Account deleted' });
  } catch (e) {
    if (/no active subscription|no subscription/i.test((e as Error).message)) return;
    throw new Error('Couldn’t cancel your Pro subscription, so your account wasn’t deleted. Try again.');
  }
}

/** Keeps the subscription going after all. */
export async function resumeSubscription() {
  const state = toState(await callStripe({ action: 'resume' }));
  await refreshPlan();
  return state;
}

export type ProFeature = 'applePay' | 'notifyPay' | 'screenshot' | 'sharing' | 'budgets' | 'pets';

/**
 * `phone` features need an iPhone or an Android phone (not a computer), `iphone` ones an iPhone; `needs` spells out
 * the requirement (checked against Apple's docs and MacroDroid's).
 */
export const PRO_FEATURES: { key: ProFeature; icon: string; title: string; text: string; devices: 'phone' | 'iphone' | 'all'; needs: string }[] = [
  {
    key: 'screenshot',
    icon: 'sparkles-outline',
    title: 'AI receipt scan',
    text: 'Snap a receipt or screenshot a payment. AI logs it for you.',
    devices: 'all',
    needs: 'Any device · one tap on iPhone',
  },
  { key: 'sharing', icon: 'people-outline', title: 'Shared budgets', text: 'Budget together with a partner or housemates.', devices: 'all', needs: 'Any device' },
  { key: 'budgets', icon: 'albums-outline', title: 'Unlimited budgets', text: 'Home, business, travel: a budget for each.', devices: 'all', needs: 'Any device' },
  { key: 'pets', icon: 'paw-outline', title: 'Every companion', text: 'Unlock the fox, panda, frog, penguin and hamster.', devices: 'all', needs: 'Any device' },
  {
    key: 'applePay',
    icon: 'phone-portrait-outline',
    title: 'Tap-to-pay auto-log',
    text: 'Pay with your phone. It’s already in your budget.',
    devices: 'phone',
    needs: 'iPhone iOS 17+ · Android with Google or Samsung Wallet',
  },
  {
    key: 'notifyPay',
    icon: 'bus-outline',
    title: 'Bus and train fares, logged',
    text: 'When SimplyGo sends a Trip Fare Alert, the exact fare is logged.',
    devices: 'phone',
    needs: 'iPhone iOS 27+ · Android with MacroDroid',
  },
];

/** On an iPhone or iPad (native, or Safari on the web). */
export function isAppleDevice() {
  if (Platform.OS === 'ios') return true;
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

/** On an Android phone or tablet (native, or a browser on one). */
export function isAndroidDevice() {
  if (Platform.OS === 'android') return true;
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

/** Free plan limits. */
export const FREE_BUDGETS = 2;
export const FREE_PETS: PetKind[] = ['cat', 'dog', 'bunny'];

export const FREE_FEATURES = [
  'Unlimited accounts, categories and transactions',
  'Targets, scheduled and split transactions',
  'Encrypted sync across your devices',
  'Reflect insights and reports',
  `${FREE_BUDGETS} budgets and ${FREE_PETS.length} companions`,
  'Import and export anytime',
];

/** Shown on the paywall. Keep in step with your Stripe prices (STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY). */
export const PRO_PRICES = [
  { key: 'yearly', label: 'Yearly', price: 'S$38.98', per: '/year', note: 'Save 35% · S$3.25 a month', best: true },
  { key: 'monthly', label: 'Monthly', price: 'S$4.98', per: '/month', note: 'Cancel anytime' },
] as const;

/** Free plan: up to FREE_BUDGETS of your own (budgets shared with you don't count). Opens the paywall when over. */
export function canCreateBudget(): boolean {
  const { budgets, sync } = useStore.getState();
  const own = Object.keys(budgets).filter((id) => !sync[id] || sync[id].role === 'owner').length;
  return own < FREE_BUDGETS || requirePro('budgets');
}

/** True when the user has Pro; otherwise opens the paywall (highlighting the feature) and returns false. */
export function requirePro(feature: ProFeature): boolean {
  if (isPro()) return true;
  router.push({ pathname: '/pro', params: { feature } });
  return false;
}
