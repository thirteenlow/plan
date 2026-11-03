import type { Session } from '@supabase/supabase-js';
import { useStore } from '@/store/store';
import { cloudConfigured } from './config';
import { type CloudUser, friendlyError, isSimple, useCloud } from './cloudStore';
import {
  changePassword,
  checkRecoveryCode,
  createRecoveryCode,
  dropRecoveryCode,
  forgetIdentityOnDevice,
  loadIdentity,
  loadIdentityOffline,
  setupIdentity,
  unlockIdentity,
  unlockPreviousKeys,
  unlockWithRecoveryCode,
} from './identity';
import { getSupabase } from './supabase';
import { flushAll, pullAll, recoverLockedBudgets, rewrapOwnKeys, startSync, stopSync } from './sync';

let started = false;

/** Restores the session (if any) and keeps cloud state in step with sign-in / sign-out. */
export async function initCloud() {
  if (started) return;
  started = true;
  if (!cloudConfigured) {
    useCloud.setState({ status: 'unconfigured' });
    return;
  }
  const sb = getSupabase()!;
  sb.auth.onAuthStateChange((_event, session) => {
    // Run outside the auth callback (supabase-js recommends not awaiting other calls inside it).
    setTimeout(() => void handleSession(session), 0);
  });
  const { data } = await sb.auth.getSession();
  await handleSession(data.session);
}

let currentUserId: string | null = null;

async function handleSession(session: Session | null) {
  if (!session) {
    stopSync();
    currentUserId = null;
    useCloud.setState({ status: 'signedOut', user: null, profile: null, hasRecovery: null, recoveryCode: null });
    return;
  }
  // Same person again (token refresh, or the email code that confirms a password reset): nothing to redo.
  const current = useCloud.getState().status;
  if (session.user.id === currentUserId && (current === 'ready' || current === 'needsUnlock' || current === 'needsSetup')) return;
  currentUserId = session.user.id;
  const meta = session.user.user_metadata ?? {};
  const user: CloudUser = { id: session.user.id, email: session.user.email ?? '', name: meta.full_name ?? meta.name, signedInAt: session.user.last_sign_in_at };
  useCloud.setState({ status: 'loading', user, error: null });
  try {
    const status = await loadIdentity(user);
    useCloud.setState({ status });
    if (status === 'ready') {
      startSync();
      if (!isSimple(useCloud.getState().profile)) void checkRecoveryCode(user);
    }
  } catch (e) {
    if (await loadIdentityOffline(user)) {
      useCloud.setState({ status: 'ready', error: 'Offline: changes will sync when you’re back online.' });
      startSync();
      return;
    }
    useCloud.setState({ status: 'signedOut', error: friendlyError(e) });
  }
}

/** First sign-in: Simple (no passphrase) or Private (a password, then an optional recovery code). */
export async function completeSetup(passphrase: string | null, onProgress?: (p: number) => void) {
  const { user } = useCloud.getState();
  if (!user) return;
  try {
    await setupIdentity(user, passphrase, (p) => onProgress?.(p / 2));
  } catch (e) {
    if (!(e instanceof Error) || e.message !== 'PROFILE_EXISTS') throw e;
    // Set up on another device meanwhile: use that (Simple opens by itself; Private asks for that password).
    const status = await loadIdentity(user);
    useCloud.setState({ status });
    if (status === 'ready') return startSync();
    throw new Error('You already set a password on another device. Enter that one instead.');
  }
  if (passphrase !== null) await issueRecoveryCode(onProgress);
  useCloud.setState({ status: 'ready' });
  startSync();
}

/** Account: switch between Simple and Private. Same key, so nothing is re-encrypted or lost. */
export async function setPrivacy(passphrase: string | null, onProgress?: (p: number) => void) {
  const { user } = useCloud.getState();
  if (!user) return;
  await changePassword(user, passphrase, (p) => onProgress?.(passphrase === null ? p : p / 2));
  if (passphrase !== null) await issueRecoveryCode(onProgress);
}

/** The person chose not to save the new recovery code. */
export async function skipRecoveryCode() {
  const { user } = useCloud.getState();
  useCloud.setState({ recoveryCode: null });
  if (user) await dropRecoveryCode(user).catch(() => undefined);
}

/** Makes a recovery code for the current key and queues it to be shown. Never blocks setup if the server lacks 011. */
async function issueRecoveryCode(onProgress?: (p: number) => void) {
  const { user } = useCloud.getState();
  if (!user) return;
  try {
    const code = await createRecoveryCode(user, (p) => onProgress?.(0.5 + p / 2));
    useCloud.setState({ recoveryCode: code });
  } catch (e) {
    console.warn('[plan recovery]', e);
    useCloud.setState({ hasRecovery: null });
  }
}

/** Settings → Account: a new recovery code (the old one stops working). */
export async function newRecoveryCode(onProgress?: (p: number) => void) {
  const { user } = useCloud.getState();
  if (!user) return;
  useCloud.setState({ recoveryCode: await createRecoveryCode(user, onProgress) });
}

/** Forgot password, step 1: the recovery code opens the key on this device. */
export async function unlockWithCode(code: string, onProgress?: (p: number) => void) {
  const { user } = useCloud.getState();
  if (!user) return;
  await unlockWithRecoveryCode(user, code, onProgress);
}

/** Forgot password, step 2: lock the same key with a new password. Nothing is lost and the code keeps working. */
export async function finishRecovery(passphrase: string, onProgress?: (p: number) => void) {
  const { user } = useCloud.getState();
  if (!user) return;
  await changePassword(user, passphrase, onProgress);
  useCloud.setState({ status: 'ready', hasRecovery: true });
  startSync();
}

export async function completeUnlock(passphrase: string, onProgress?: (p: number) => void) {
  const { user } = useCloud.getState();
  if (!user) return;
  await unlockIdentity(user, passphrase, onProgress);
  useCloud.setState({ status: 'ready' });
  startSync();
  void checkRecoveryCode(user);
}

/**
 * Signs out and removes this account's keys and sync links from the device.
 * Budgets stay on the device as personal copies.
 */
export async function signOutEverywhereOnDevice() {
  const uid = useCloud.getState().user?.id;
  // Save anything not yet uploaded, then clear the device so the next person can't see this data.
  if (useCloud.getState().status === 'ready') await flushAll().catch(() => undefined);
  stopSync();
  wipeDevice();
  await forgetIdentityOnDevice(uid ?? undefined);
  await getSupabase()?.auth.signOut();
}

/** Removes every budget from this device (they live on the account). */
function wipeDevice() {
  useStore.setState({ budgets: {}, activeBudgetId: null, sync: {} });
}

/**
 * Forgot password: create new keys, protected by a new password (or none, for Simple). Budgets you own keep syncing
 * (their keys are re-sealed to your new key from this device). Budgets others shared with you can no
 * longer be decrypted; local copies are kept and the owner can invite you again.
 */
export async function resetEncryption(passphrase: string | null, onProgress?: (p: number) => void) {
  const { user } = useCloud.getState();
  if (!user) return;
  stopSync();
  await setupIdentity(user, passphrase, (p) => onProgress?.(p / 2), true);
  // New key, so the old recovery code no longer opens it.
  if (passphrase !== null) await issueRecoveryCode(onProgress);
  else await dropRecoveryCode(user).catch(() => undefined);
  const lost = await rewrapOwnKeys();
  useCloud.setState({
    status: 'ready',
    notice: lost.length ? `Ask the owners of ${lost.map((n) => `“${n}”`).join(', ')} to invite you again. Your copies were kept on this device.` : null,
  });
  startSync();
  // Budgets that weren't on this device are still sealed to the old key. They're kept on the account (shown as
  // locked) so they can be opened again with the old password; only the person decides to remove them.
  await pullAll();
}

/** Opens budgets locked by a password reset, using the old password. */
export async function recoverWithOldPassword(oldPassphrase: string, onProgress?: (p: number) => void) {
  const keys = await unlockPreviousKeys(oldPassphrase, onProgress);
  if (!keys.length) throw new Error('That isn’t a password this account used before.');
  return recoverLockedBudgets(keys);
}

/**
 * Permanently deletes the signed-in account on the server: profile, encryption key backup, budgets the user
 * owns (for every member) and memberships. Budgets on this device are kept as personal, offline copies.
 */
export async function deleteAccount() {
  const sb = getSupabase();
  if (!sb) return;
  const uid = useCloud.getState().user?.id;
  const { error } = await sb.rpc('delete_my_account');
  if (error) throw error;
  stopSync();
  wipeDevice();
  await forgetIdentityOnDevice(uid);
  await sb.auth.signOut();
}
