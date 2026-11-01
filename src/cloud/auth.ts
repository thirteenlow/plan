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
  const { data, error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: url, skipBrowserRedirect: Platform.OS !== 'web' } });
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

/**
 * Email sign-in with a one-time code (free, no password). Supabase emails a code; the user types it in.
 * The project's "Magic Link" email template must include {{ .Token }} (see docs/CLOUD_SETUP.md).
 */
export async function sendEmailCode(email: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud sync isn’t configured');
  const { error } = await sb.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
  if (error) throw friendlyAuthError(error);
}

export async function verifyEmailCode(email: string, code: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud sync isn’t configured');
  const { error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: 'email' });
  if (error) throw friendlyAuthError(error);
}

function friendlyAuthError(error: { message: string; status?: number }) {
  const m = error.message.toLowerCase();
  if (error.status === 429 || m.includes('rate limit') || m.includes('security purposes')) return new Error('Too many attempts. Please wait a minute and try again.');
  if (m.includes('expired') || m.includes('invalid')) return new Error('That code is wrong or has expired. Check the latest email, or send a new code.');
  if (m.includes('signups not allowed')) return new Error('Email sign-in is turned off for this project.');
  return new Error(error.message);
}
