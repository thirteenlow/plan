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
  kdf: import('@/security/crypto').KdfParams;
}

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
  /** A recovery code is saved on the account (null: not known yet, or the server isn't set up for it) */
  hasRecovery: boolean | null;
  /** A new recovery code to show once, until the person confirms they saved it */
  recoveryCode: string | null;
}>(() => ({ status: 'starting', user: null, profile: null, syncing: false, lastSyncAt: null, error: null, notice: null, locked: 0, firstPullDone: false, hasRecovery: null, recoveryCode: null }));

export const friendlyError = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  if (/network|fetch/i.test(msg)) return 'Can’t reach the server. Check your connection and try again.';
  if (/invalid tag/i.test(msg)) return 'Something couldn’t be decrypted. It may have been saved with an old password.';
  return msg.length > 200 ? `${msg.slice(0, 200)}…` : msg;
};
