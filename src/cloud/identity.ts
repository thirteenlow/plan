import { b64, bytesEqual, type KeyPair, lockPrivateKey, newKeyPair, publicKeyFor, unb64, unlockPrivateKey } from '@/security/crypto';
import { secretStore } from '@/security/deviceKey';
import { type CloudUser, type ProfileRow, useCloud } from './cloudStore';
import { getSupabase } from './supabase';

/** This user's identity key pair, held in memory while signed in (private key also in the Keychain/Keystore). */
let identity: KeyPair | null = null;
export const getIdentity = () => identity;

const secretName = (uid: string) => `finch.identity.${uid}`;

/**
 * The key backup kept on the account: as is (every account now), so any device the person signs in on unlocks by
 * itself. Older accounts locked it with a separate encryption password, kept only to open those once.
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

/** First sign-in (or starting over): create the identity key pair and back it up on the account. */
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

/** Older account on a new device: decrypt the key backup with its encryption password. Throws if wrong. */
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

/** Signed in and unlocked: replace the key backup (same key, so nothing is re-encrypted or lost). */
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
