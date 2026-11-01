/**
 * Cloud settings come from environment variables (see .env.example). Expo inlines EXPO_PUBLIC_* at build time.
 * Use the publishable key (sb_publishable_…, or the legacy anon key): it is meant to ship in apps and
 * row-level security on the server decides what it can do. A secret key must never be bundled.
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Secret / service-role keys bypass row-level security; refuse to run with one. */
export const usingSecretKey = /^sb_secret_/.test(SUPABASE_ANON_KEY) || /"role"\s*:\s*"service_role"/.test(decodeJwtPayload(SUPABASE_ANON_KEY));

export const cloudConfigured = /^https:\/\/\S+$/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20 && !usingSecretKey;

if (usingSecretKey) console.error('[plan] EXPO_PUBLIC_SUPABASE_ANON_KEY is a secret key. Use the publishable key instead; cloud sync is disabled.');

function decodeJwtPayload(key: string): string {
  const part = key.split('.')[1];
  if (!part) return '';
  try {
    return globalThis.atob(part.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return '';
  }
}

/** Sign in with Apple needs a paid Apple Developer account; flip to true once you have one (see docs/CLOUD_SETUP.md). */
export const APPLE_SIGN_IN_ENABLED = false;
