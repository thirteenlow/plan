import { b64, bytesEqual, type KdfParams, type KeyPair, lockPrivateKey, newKeyPair, publicKeyFor, unb64, unlockPrivateKey } from '@/security/crypto';
import { secretStore } from '@/security/deviceKey';
import { randomBytes } from '@/security/random';
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

/**
 * The key backup kept on the account. Private: locked with the person's password (the server can't read it).
 * Simple: stored as is, so any device they sign in on unlocks by itself (the server could read it).
 */
async function keyBackup(privateKey: Uint8Array, passphrase: string | null, onProgress?: (p: number) => void): Promise<Pick<ProfileRow, 'kdf' | 'encrypted_private_key'>> {
  if (passphrase === null) return { kdf: { alg: 'none' }, encrypted_private_key: b64(privateKey) };
  const { kdf, encryptedPrivateKey } = await lockPrivateKey(privateKey, passphrase, onProgress);
  return { kdf, encrypted_private_key: encryptedPrivateKey };
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
  if (profile.kdf.alg === 'none') {
    const privateKey = unb64(profile.encrypted_private_key);
    await secretStore.set(secretName(user.id), b64(privateKey));
    identity = { privateKey, publicKey: publicKeyFor(privateKey) };
    return 'ready';
  }
  return 'needsUnlock';
}

/** First sign-in (or starting over): create the identity key pair and back it up. No password means Simple. */
export async function setupIdentity(user: CloudUser, passphrase: string | null, onProgress?: (p: number) => void, replace = false) {
  const sb = getSupabase()!;
  const kp = newKeyPair();
  const profile: ProfileRow = { public_key: b64(kp.publicKey), ...(await keyBackup(kp.privateKey, passphrase, onProgress)) };
  const row = { id: user.id, email: user.email, display_name: user.name?.slice(0, 80) ?? null, ...profile, updated_at: new Date().toISOString() };
  if (replace) await keepPreviousKey(user);
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
    privateKey = profile.kdf.alg === 'none' ? unb64(profile.encrypted_private_key) : await unlockPrivateKey(profile.encrypted_private_key, profile.kdf, passphrase, onProgress);
  } catch {
    throw new Error('That password isn’t right.');
  }
  await secretStore.set(secretName(user.id), b64(privateKey));
  identity = { privateKey, publicKey: publicKeyFor(privateKey) };
}

/**
 * Signed in and unlocked: back up the same key with a new password, or with none (switching to Simple). Nothing is
 * re-encrypted and no budget is lost, so this is also the way out of a forgotten password while a device is open.
 */
export async function changePassword(user: CloudUser, passphrase: string | null, onProgress?: (p: number) => void) {
  if (!identity) throw new Error('Unlock encryption first.');
  const profile: ProfileRow = { public_key: b64(identity.publicKey), ...(await keyBackup(identity.privateKey, passphrase, onProgress)) };
  const sb = getSupabase()!;
  const { error } = await sb
    .from('profiles')
    .update({ encrypted_private_key: profile.encrypted_private_key, kdf: profile.kdf, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .eq('public_key', profile.public_key);
  if (error) throw error;
  useCloud.setState({ profile });
  if (passphrase === null) {
    // Simple has nothing to recover; drop any recovery code so it can't be used.
    await sb.from('profiles').update({ recovery_private_key: null, recovery_kdf: null }).eq('id', user.id);
    useCloud.setState({ hasRecovery: null });
  }
}

// ---------- Recovery code ----------

// No 0/O or 1/I, so it reads back from paper without guessing. 20 characters = 100 bits.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 20;
const missingRecovery = (e: { code?: string; message?: string }) => e.code === '42703' || e.code === 'PGRST204' || /recovery_/.test(e.message ?? '');

/** Ignores case, spaces and dashes, so a code typed from paper still matches. */
export const normalizeRecoveryCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

function newRecoveryCode() {
  // 256 is a multiple of 32, so taking each byte modulo the alphabet length stays uniform.
  const chars = Array.from(randomBytes(CODE_LENGTH), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return chars.match(/.{5}/g)!.join('-');
}

/**
 * Locks a second copy of the (unlocked) key with a new recovery code and saves it to the account, replacing any
 * earlier code. Returns the code, which is shown once and never stored in plain form.
 */
export async function createRecoveryCode(user: CloudUser, onProgress?: (p: number) => void): Promise<string> {
  if (!identity) throw new Error('Unlock encryption first.');
  const code = newRecoveryCode();
  const { kdf, encryptedPrivateKey } = await lockPrivateKey(identity.privateKey, normalizeRecoveryCode(code), onProgress);
  const { error } = await getSupabase()!.from('profiles').update({ recovery_private_key: encryptedPrivateKey, recovery_kdf: kdf }).eq('id', user.id);
  if (error) {
    if (missingRecovery(error)) throw new Error('Recovery codes aren’t set up on the server yet (run supabase/011_recovery_code.sql).');
    throw error;
  }
  useCloud.setState({ hasRecovery: true });
  return code;
}

/** Skipped saving a new recovery code: remove it so the account doesn't count as having one. */
export async function dropRecoveryCode(user: CloudUser) {
  await getSupabase()!.from('profiles').update({ recovery_private_key: null, recovery_kdf: null }).eq('id', user.id);
  useCloud.setState({ hasRecovery: false });
}

/** Whether this account has a recovery code saved (null if the server can't tell, e.g. before 011 is run). */
export async function checkRecoveryCode(user: CloudUser): Promise<boolean | null> {
  const { data, error } = await getSupabase()!.from('profiles').select('recovery_kdf').eq('id', user.id).maybeSingle();
  const has = error ? null : !!(data as { recovery_kdf: unknown } | null)?.recovery_kdf;
  useCloud.setState({ hasRecovery: has });
  return has;
}

/** Forgot password: opens the key with the recovery code and keeps it on this device. Throws on a wrong code. */
export async function unlockWithRecoveryCode(user: CloudUser, code: string, onProgress?: (p: number) => void) {
  const { data, error } = await getSupabase()!.from('profiles').select('public_key, recovery_private_key, recovery_kdf').eq('id', user.id).maybeSingle();
  if (error && !missingRecovery(error)) throw error;
  const row = data as { public_key: string; recovery_private_key: string | null; recovery_kdf: KdfParams | null } | null;
  if (!row?.recovery_private_key || !row.recovery_kdf) throw new Error('This account has no recovery code.');
  let privateKey: Uint8Array;
  try {
    privateKey = await unlockPrivateKey(row.recovery_private_key, row.recovery_kdf, normalizeRecoveryCode(code), onProgress);
  } catch {
    throw new Error('That code isn’t right.');
  }
  const publicKey = publicKeyFor(privateKey);
  if (!bytesEqual(publicKey, unb64(row.public_key))) throw new Error('That code is from before a reset and no longer works.');
  await secretStore.set(secretName(user.id), b64(privateKey));
  identity = { privateKey, publicKey };
}

const missingTable = (e: { code?: string; message?: string }) => e.code === '42P01' || e.code === 'PGRST205' || /previous_keys/.test(e.message ?? '');

/**
 * Before a password reset replaces the key backup, keep the old one (still locked with the old password), so
 * budgets sealed to it can be opened again if that password turns up. Needs supabase/010_previous_keys.sql.
 */
async function keepPreviousKey(user: CloudUser) {
  const sb = getSupabase()!;
  const { data, error } = await sb.from('profiles').select('public_key, encrypted_private_key, kdf').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (!data) return;
  const { error: saveError } = await sb.from('previous_keys').insert({ user_id: user.id, ...(data as ProfileRow) });
  if (saveError && !missingTable(saveError)) throw saveError;
}

/** The old identity keys (from before password resets) that this password unlocks. */
export async function unlockPreviousKeys(passphrase: string, onProgress?: (p: number) => void): Promise<KeyPair[]> {
  const sb = getSupabase()!;
  const { data, error } = await sb.from('previous_keys').select('encrypted_private_key, kdf').order('replaced_at', { ascending: false });
  if (error) {
    if (missingTable(error)) return [];
    throw error;
  }
  const rows = (data ?? []) as Pick<ProfileRow, 'encrypted_private_key' | 'kdf'>[];
  const found: KeyPair[] = [];
  for (const [i, row] of rows.entries()) {
    try {
      if (row.kdf.alg === 'none') {
        const privateKey = unb64(row.encrypted_private_key);
        found.push({ privateKey, publicKey: publicKeyFor(privateKey) });
        continue;
      }
      const privateKey = await unlockPrivateKey(row.encrypted_private_key, row.kdf, passphrase, (p) => onProgress?.((i + p) / rows.length));
      found.push({ privateKey, publicKey: publicKeyFor(privateKey) });
    } catch {
      // A different old password; try the next one.
    }
  }
  return found;
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
