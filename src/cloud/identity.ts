import { b64, bytesEqual, type KeyPair, lockPrivateKey, newKeyPair, publicKeyFor, unb64, unlockPrivateKey } from '@/security/crypto';
import { secretStore } from '@/security/deviceKey';
import { type CloudUser, type ProfileRow, useCloud } from './cloudStore';
import { getSupabase } from './supabase';

/** This user's identity key pair, held in memory while signed in (private key also in the Keychain/Keystore). */
let identity: KeyPair | null = null;
export const getIdentity = () => identity;

const secretName = (uid: string) => `finch.identity.${uid}`;

/**
 * Password rules shown as a live checklist. The password protects the encryption key backup, so it
 * needs to resist offline guessing: length plus the usual mix of character types.
 */
export const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: 'At least 10 characters', test: (p) => p.length >= 10 },
  { label: 'Upper and lowercase letters', test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: 'A number', test: (p) => /\d/.test(p) },
  { label: 'A symbol, like ! @ # $', test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

export function validatePassword(pass: string, confirm: string, email: string): string | null {
  if (!PASSWORD_RULES.every((r) => r.test(pass))) return 'Your password doesn’t meet all the rules yet.';
  if (pass.length > 128) return 'Use 128 characters or fewer.';
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (local.length >= 4 && pass.toLowerCase().includes(local)) return 'Don’t include your email address in your password.';
  if (new Set(pass).size < 6) return 'That password is too repetitive.';
  if (pass !== confirm) return 'The passwords don’t match.';
  return null;
}

/** Works out whether this user needs to create a password, unlock with it, or is ready. */
export async function loadIdentity(user: CloudUser): Promise<'needsSetup' | 'needsUnlock' | 'ready'> {
  const sb = getSupabase()!;
  const { data, error } = await sb.from('profiles').select('public_key, encrypted_private_key, kdf').eq('id', user.id).maybeSingle();
  if (error) throw error;
  const profile = data as ProfileRow | null;
  useCloud.setState({ profile });
  if (!profile) return 'needsSetup';
  const stored = await secretStore.get(secretName(user.id));
  if (stored) {
    const privateKey = unb64(stored);
    const publicKey = publicKeyFor(privateKey);
    if (bytesEqual(publicKey, unb64(profile.public_key))) {
      identity = { privateKey, publicKey };
      return 'ready';
    }
  }
  return 'needsUnlock';
}

/** First sign-in: create the identity key pair and back it up, encrypted with the password. */
export async function setupIdentity(user: CloudUser, passphrase: string, onProgress?: (p: number) => void, replace = false) {
  const sb = getSupabase()!;
  const kp = newKeyPair();
  const { kdf, encryptedPrivateKey } = await lockPrivateKey(kp.privateKey, passphrase, onProgress);
  const profile: ProfileRow = { public_key: b64(kp.publicKey), encrypted_private_key: encryptedPrivateKey, kdf };
  const row = { id: user.id, email: user.email, display_name: user.name?.slice(0, 80) ?? null, ...profile, updated_at: new Date().toISOString() };
  // First setup only inserts, so two devices setting a password at once can't silently replace each other's keys.
  const { error } = replace ? await sb.from('profiles').upsert(row) : await sb.from('profiles').insert(row);
  if (error) {
    if (!replace && error.code === '23505') throw new Error('PROFILE_EXISTS');
    throw error;
  }
  await secretStore.set(secretName(user.id), b64(kp.privateKey));
  identity = kp;
  useCloud.setState({ profile });
}

/** New device: decrypt the private key backup with the password. Throws on a wrong password. */
export async function unlockIdentity(user: CloudUser, passphrase: string, onProgress?: (p: number) => void) {
  const profile = useCloud.getState().profile;
  if (!profile) throw new Error('Profile not loaded');
  let privateKey: Uint8Array;
  try {
    privateKey = await unlockPrivateKey(profile.encrypted_private_key, profile.kdf, passphrase, onProgress);
  } catch {
    throw new Error('That password isn’t right.');
  }
  await secretStore.set(secretName(user.id), b64(privateKey));
  identity = { privateKey, publicKey: publicKeyFor(privateKey) };
}

export async function forgetIdentityOnDevice(uid: string | undefined) {
  identity = null;
  if (uid) await secretStore.remove(secretName(uid));
}

/** No connection: if this device already holds the user's key, let them in and sync later. */
export async function loadIdentityOffline(user: CloudUser): Promise<boolean> {
  const stored = await secretStore.get(secretName(user.id));
  if (!stored) return false;
  const privateKey = unb64(stored);
  identity = { privateKey, publicKey: publicKeyFor(privateKey) };
  return true;
}
