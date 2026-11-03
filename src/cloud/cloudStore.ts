import { create } from 'zustand';

export type CloudStatus = 'unconfigured' | 'starting' | 'signedOut' | 'loading' | 'needsSetup' | 'needsUnlock' | 'ready';

export interface CloudUser {
  id: string;
  email: string;
  name?: string;
  /** When this sign-in happened (Google, Apple or an email code), not when the session was last refreshed */
  signedInAt?: string;
}

export interface ProfileRow {
  public_key: string;
  encrypted_private_key: string;
  /** "none": kept as is on the account. scrypt: locked with an older account's encryption password */
  kdf: import('@/security/crypto').KdfParams | { alg: 'none' };
}

/** The key is kept on the account (every account now; older ones locked it with an encryption password). */
export const keyOnAccount = (profile: ProfileRow | null) => profile?.kdf.alg === 'none';

/** Non-persisted cloud/session state for the UI. */
export const useCloud = create<{
  status: CloudStatus;
  user: CloudUser | null;
  profile: ProfileRow | null;
  syncing: boolean;
  lastSyncAt: string | null;
  error: string | null;
  notice: string | null;
  /** Budgets on the account that can't be decrypted with this identity */
  locked: number;
  /** The first download of the account's budgets after signing in has finished */
  firstPullDone: boolean;
  /** Signed in with an emailed reset code: asking for a new password before going on */
  settingPassword: boolean;
}>(() => ({ status: 'starting', user: null, profile: null, syncing: false, lastSyncAt: null, error: null, notice: null, locked: 0, firstPullDone: false, settingPassword: false }));

export const friendlyError = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  if (/network|fetch/i.test(msg)) return 'Can’t reach the server. Check your connection and try again.';
  if (/invalid tag/i.test(msg)) return 'Something couldn’t be decrypted. It may have been saved with an old password.';
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
};
