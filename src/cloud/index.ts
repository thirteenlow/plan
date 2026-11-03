import type { Session } from '@supabase/supabase-js';
import { useStore } from '@/store/store';
import { cloudConfigured } from './config';
import { type CloudUser, friendlyError, keyOnAccount, useCloud } from './cloudStore';
import { changePassword, forgetIdentityOnDevice, loadIdentity, loadIdentityOffline, setupIdentity, unlockIdentity, unlockPreviousKeys } from './identity';
import { cancelBeforeDeleting } from './pro';
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
    useCloud.setState({ status: 'signedOut', user: null, profile: null, settingPassword: false });
    return;
  }
  // Same person again (token refresh, or the email code that confirms a password reset): nothing to redo.
  const current = useCloud.getState().status;
  if (session.user.id === currentUserId && (current === 'ready' || current === 'needsUnlock')) return;
  currentUserId = session.user.id;
  const meta = session.user.user_metadata ?? {};
  const user: CloudUser = { id: session.user.id, email: session.user.email ?? '', name: meta.full_name ?? meta.name, signedInAt: session.user.last_sign_in_at };
  useCloud.setState({ status: 'loading', user, error: null });
  try {
    let status = await loadIdentity(user);
    if (status === 'needsSetup') status = await createKeys(user);
    useCloud.setState({ status });
    if (status === 'ready') {
      await keepKeyOnAccount(user);
      startSync();
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

/** First sign-in: make the encryption keys behind the scenes, kept on the account so every device just works. */
async function createKeys(user: CloudUser) {
  try {
    await setupIdentity(user, null);
    return 'ready' as const;
  } catch (e) {
    // Made on another device at the same moment: use those.
    if (e instanceof Error && e.message === 'PROFILE_EXISTS') return loadIdentity(user);
    throw e;
  }
}

/**
 * Accounts from before (when the key was locked with a separate encryption password) move to keeping it on the
 * account once they're unlocked, so nobody is asked for that password again.
 */
async function keepKeyOnAccount(user: CloudUser) {
  if (keyOnAccount(useCloud.getState().profile)) return;
  await changePassword(user, null).catch((e) => console.warn('[plan keys]', e));
}

/** Older account on a new device: its old encryption password, asked for this one time. */
export async function completeUnlock(passphrase: string, onProgress?: (p: number) => void) {
  const { user } = useCloud.getState();
  if (!user) return;
  await unlockIdentity(user, passphrase, onProgress);
  await keepKeyOnAccount(user);
  useCloud.setState({ status: 'ready' });
  startSync();
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
 * Older account that forgot its old encryption password: new keys, kept on the account. Budgets you own on this
 * device keep syncing (re-sealed to the new key). Ones that aren't here stay locked until the old password turns
 * up; shared ones need a new invite (your copies are kept).
 */
export async function resetEncryption() {
  const { user } = useCloud.getState();
  if (!user) return;
  stopSync();
  await setupIdentity(user, null, undefined, true);
  const lost = await rewrapOwnKeys();
  useCloud.setState({
    status: 'ready',
    notice: lost.length ? `Ask the owners of ${lost.map((n) => `“${n}”`).join(', ')} to invite you again. Your copies were kept on this device.` : null,
  });
  startSync();
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
  await cancelBeforeDeleting();
  const { error } = await sb.rpc('delete_my_account');
  if (error) throw error;
  stopSync();
  wipeDevice();
  await forgetIdentityOnDevice(uid);
  await sb.auth.signOut();
}
