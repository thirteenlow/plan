import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { randomToken, sha256Hex } from '@/security/crypto';
import { getSupabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

const redirectTo = () => (Platform.OS === 'web' ? `${window.location.origin}/account` : makeRedirectUri({ path: 'auth-callback' }));

/**
 * Google (all platforms) and Apple on web/Android: Supabase OAuth in a secure system browser sheet,
 * then the tokens from the redirect become the session.
 */
export async function signInWithProvider(provider: 'google' | 'apple') {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud sync isn’t configured');
  const url = redirectTo();
  // Without select_account Google silently reuses whichever account the browser last used, so you can't switch.
  const queryParams = provider === 'google' ? { prompt: 'select_account' } : undefined;
  const { data, error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: url, skipBrowserRedirect: Platform.OS !== 'web', queryParams } });
  if (error) throw error;
  if (Platform.OS === 'web') return; // the browser navigates away and comes back signed in
  const res = await WebBrowser.openAuthSessionAsync(data.url, url);
  if (res.type !== 'success') return;
  const params = readRedirectParams(res.url);
  if (params.error) throw new Error(params.error_description || params.error);
  if (!params.access_token || !params.refresh_token) throw new Error('Sign-in was not completed.');
  const { error: sessionError } = await sb.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token });
  if (sessionError) throw sessionError;
}

/** Reads OAuth results from the redirect URL's query and fragment (Supabase puts tokens in the fragment). */
export function readRedirectParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = [url.split('?')[1]?.split('#')[0], url.split('#')[1]].filter(Boolean) as string[];
  for (const part of parts) {
    for (const pair of part.split('&')) {
      const [k, v = ''] = pair.split('=');
      if (k) out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
    }
  }
  return out;
}

export const nativeAppleAvailable = () => (Platform.OS === 'ios' ? AppleAuthentication.isAvailableAsync() : Promise.resolve(false));

/** Native Sign in with Apple on iOS. A hashed nonce goes to Apple and the raw one to Supabase to stop token replay. */
export async function signInWithAppleNative() {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud sync isn’t configured');
  const rawNonce = randomToken();
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: sha256Hex(rawNonce),
    });
    if (!credential.identityToken) throw new Error('Apple didn’t return an identity token.');
    const { error } = await sb.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: rawNonce });
    if (error) throw error;
    // Apple only shares the name on the very first sign-in.
    const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
    if (name) await sb.auth.updateUser({ data: { full_name: name } });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return;
    throw e;
  }
}

export async function signOut() {
  await getSupabase()?.auth.signOut();
}

export const MIN_PASSWORD = 8;

/** What a new sign-in password needs, shown as a live checklist. (Also set these under Supabase → Auth → Passwords.) */
export const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: `At least ${MIN_PASSWORD} characters`, test: (p) => p.length >= MIN_PASSWORD },
  { label: 'An uppercase and a lowercase letter', test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: 'A number', test: (p) => /\d/.test(p) },
  { label: 'A symbol, like ! @ # $', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];
export const strongPassword = (p: string) => PASSWORD_RULES.every((r) => r.test(p));
const clean = (email: string) => email.trim().toLowerCase();
const client = () => {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud sync isn’t configured');
  return sb;
};

/**
 * New email account with a password. Returns false when Supabase's "Confirm email" setting is on and the person
 * must click the link in their inbox before signing in.
 */
export async function signUpWithEmail(email: string, password: string): Promise<boolean> {
  const { data, error } = await client().auth.signUp({ email: clean(email), password, options: { emailRedirectTo: redirectTo() } });
  if (error) throw friendlyAuthError(error);
  // An address that's already registered comes back with no identities (Supabase hides that it exists).
  if (data.user && !data.user.identities?.length) throw new Error('There’s already an account with this email. Sign in instead.');
  return !!data.session;
}

export async function signInWithEmail(email: string, password: string) {
  const { error } = await client().auth.signInWithPassword({ email: clean(email), password });
  if (error) throw friendlyAuthError(error);
}

/**
 * Forgot password, step 1: email a one-time code. Uses the sign-in code email (its "Magic Link" template must
 * include {{ .Token }}, see docs/CLOUD_SETUP.md), and never creates an account.
 */
export async function sendResetCode(email: string) {
  const { error } = await client().auth.signInWithOtp({ email: clean(email), options: { shouldCreateUser: false } });
  if (error) {
    if (/signups not allowed|not found/i.test(error.message)) throw new Error('No account with this email.');
    throw friendlyAuthError(error);
  }
}

/** Forgot password, step 2: the code signs the person in, then they choose a new password. */
export async function verifyResetCode(email: string, code: string) {
  const { error } = await client().auth.verifyOtp({ email: clean(email), token: code, type: 'email' });
  if (error) throw friendlyAuthError(error);
}

/** Sets the signed-in person's password (after a reset code, or for accounts made before passwords). */
export async function setAccountPassword(password: string) {
  const { error } = await client().auth.updateUser({ password });
  if (error) throw friendlyAuthError(error);
}

function friendlyAuthError(error: { message: string; status?: number }) {
  const m = error.message.toLowerCase();
  if (m.includes('invalid login credentials')) return new Error('Wrong email or password.');
  if (m.includes('email not confirmed')) return new Error('Confirm your email first: open the link we sent you.');
  if (m.includes('already registered')) return new Error('There’s already an account with this email. Sign in instead.');
  if (m.includes('should be different')) return new Error('Choose a password you haven’t used here before.');
  if (m.includes('password should') || m.includes('weak password')) return new Error('That password isn’t strong enough. Check the list below it.');
  // A short wait between codes for the same address ("…you can only request this after 42 seconds").
  const wait = m.match(/after (\d+) seconds?/)?.[1];
  if (wait) return new Error(`A code was just sent. Check your email, or wait ${wait} seconds to send another.`);
  // The project's hourly email allowance (very low on Supabase's built-in email service), not anything you did.
  if (m.includes('email rate limit')) return new Error('Plan has sent too many emails in the last hour. Please try again later.');
  if (error.status === 429 || m.includes('rate limit')) return new Error('Too many attempts. Please wait a minute and try again.');
  if (m.includes('expired') || m.includes('invalid')) return new Error('That code is wrong or has expired. Check the latest email, or send a new code.');
  if (m.includes('signups not allowed')) return new Error('Email sign-in is turned off for this project.');
  return new Error(error.message);
}
