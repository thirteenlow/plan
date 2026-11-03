import type { RealtimeChannel } from '@supabase/supabase-js';
import { AppState, type NativeEventSubscription } from 'react-native';
import { b64, type KeyPair, newKey, openJSON, sealJSON, unb64, unwrapKey, wrapKeyFor } from '@/security/crypto';
import { randomId } from '@/security/random';
import { useStore } from '@/store/store';
import type { SyncMeta } from '@/store/types';
import { isValidBudget } from '@/utils/validation';
import { friendlyError, useCloud } from './cloudStore';
import { getIdentity } from './identity';
import { syncReminders } from '@/notifications/reminders';
import { refreshPlan, usePlan } from './pro';
import { deepEqual, mergeBudgets, type SharedBudget, sharedPart, withPersonal } from './merge';
import { importPayments } from './inbox';
import { pullPersonal, resetPersonal, schedulePersonalPush } from './personal';
import { getSupabase } from './supabase';

/*
 * Sync model
 * - Each shared budget is one encrypted snapshot on the server with a version number.
 * - Local edits are pushed (debounced) with the version they were based on; the server rejects stale writes.
 * - On a conflict, or when someone else saves, we pull, decrypt and three-way merge with the last synced
 *   snapshot, then push the merge. Realtime events and a periodic pull keep devices current.
 */

const aad = (remoteId: string, keyVersion: number) => `finch/budget/${remoteId}/${keyVersion}`;
const wrapContext = (remoteId: string, keyVersion: number) => `finch/budget-key/${remoteId}/${keyVersion}`;

interface RemoteRow {
  id: string;
  owner_id: string;
  version: number;
  key_version: number;
  ciphertext: string;
}
interface Membership {
  budget_id: string;
  role: 'owner' | 'editor';
  wrapped_key: string;
  key_version: number;
}
export interface Member {
  user_id: string;
  role: 'owner' | 'editor';
  email: string;
  display_name: string | null;
  public_key: string;
}

let running = false;
let applyingRemote = false;
let channel: RealtimeChannel | null = null;
let unsubscribeStore: (() => void) | null = null;
let appStateSub: NativeEventSubscription | null = null;
let interval: ReturnType<typeof setInterval> | null = null;
const timers: Record<string, ReturnType<typeof setTimeout>> = {};
/**
 * Budgets on the account whose key was sealed to a different identity key (e.g. from before a password
 * reset, or another device that set a password at the same time). They can't be opened here, so they're
 * listed once instead of failing every sync.
 */
const locked = new Map<string, Membership>();
const inflight = new Set<string>();
const again = new Set<string>();

const sb = () => {
  const c = getSupabase();
  if (!c) throw new Error('Cloud sync isn’t configured');
  return c;
};
const me = () => {
  const user = useCloud.getState().user;
  const identity = getIdentity();
  if (!user || !identity) throw new Error('Sign in and unlock encryption first.');
  return { user, identity };
};
const localIdFor = (remoteId: string) => Object.entries(useStore.getState().sync).find(([, m]) => m.remoteId === remoteId)?.[0];

function setError(e: unknown) {
  console.warn('[plan sync]', e);
  useCloud.setState({ error: friendlyError(e) });
}

// ---------- lifecycle ----------

export function startSync() {
  if (running) return;
  running = true;
  const { user } = me();

  // Push whenever a shared budget changes locally (but not when we're applying a remote change).
  unsubscribeStore = useStore.subscribe((state, prev) => {
    if (applyingRemote) return;
    for (const id of Object.keys(state.sync)) {
      if (state.budgets[id] && state.budgets[id] !== prev.budgets[id]) schedulePush(id);
    }
    if (state.budgets !== prev.budgets) schedulePersonalPush();
    // Every budget belongs to the account: new ones (created, imported, demo) are uploaded automatically.
    for (const id of Object.keys(state.budgets)) {
      if (!state.sync[id] && !prev.budgets[id]) scheduleUpload(id);
    }
  });

  channel = sb()
    .channel(`plan-sync-${user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_budgets' }, (payload) => {
      const row = payload.new as Partial<RemoteRow & { updated_by: string }> | undefined;
      if (payload.eventType === 'DELETE') void pullAll();
      else if (row?.id && row.updated_by !== user.id) void pullOne(row.id);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_members', filter: `user_id=eq.${user.id}` }, () => void pullAll())
    .subscribe();

  interval = setInterval(() => void pullAll(), 60_000);
  appStateSub = AppState.addEventListener('change', (s) => {
    if (s === 'active') void pullAll();
  });
  void pullAll();
}

export function stopSync() {
  running = false;
  usePlan.setState({ plan: 'free', expiresAt: null });
  unsubscribeStore?.();
  unsubscribeStore = null;
  if (channel) void getSupabase()?.removeChannel(channel);
  channel = null;
  if (interval) clearInterval(interval);
  interval = null;
  appStateSub?.remove();
  appStateSub = null;
  for (const t of Object.values(timers)) clearTimeout(t);
  resetPersonal();
  locked.clear();
  useCloud.setState({ locked: 0, firstPullDone: false });
}

const uploading = new Set<string>();
function scheduleUpload(localId: string) {
  if (uploading.has(localId)) return;
  uploading.add(localId);
  setTimeout(() => {
    void (async () => {
      try {
        const state = useStore.getState();
        if (state.budgets[localId] && !state.sync[localId]) await shareBudget(localId);
      } catch (e) {
        setError(e);
      } finally {
        uploading.delete(localId);
      }
    })();
  }, 800);
}

/** Uploads any budget on this device that isn't on the account yet (e.g. made offline). */
function uploadUnsynced() {
  const state = useStore.getState();
  for (const id of Object.keys(state.budgets)) if (!state.sync[id]) scheduleUpload(id);
}

/** Pushes every pending change now (used before signing out). */
export async function flushAll() {
  for (const id of Object.keys(timers)) clearTimeout(timers[id]);
  for (const id of Object.keys(useStore.getState().sync)) await pushBudget(id);
}

function schedulePush(localId: string) {
  clearTimeout(timers[localId]);
  timers[localId] = setTimeout(() => void pushBudget(localId), 1500);
}

function applyRemote(fn: () => void) {
  applyingRemote = true;
  try {
    fn();
  } finally {
    applyingRemote = false;
  }
}

// ---------- pull ----------

export async function pullAll() {
  if (!running) return;
  // Pro is granted on the server; pick up changes on every sync.
  void refreshPlan();
  try {
    const { user } = me();
    useCloud.setState({ syncing: true, error: null });
    // Budgets first; a problem here mustn't stop payments logged while the app was closed from being imported.
    try {
      const { data: mems, error } = await sb().from('budget_members').select('budget_id, role, wrapped_key, key_version').eq('user_id', user.id);
      if (error) throw error;
      const memberships = (mems ?? []) as Membership[];
      const ids = memberships.map((m) => m.budget_id);
      let rows: RemoteRow[] = [];
      if (ids.length) {
        const res = await sb().from('shared_budgets').select('id, owner_id, version, key_version, ciphertext').in('id', ids);
        if (res.error) throw res.error;
        rows = res.data as RemoteRow[];
      }
      for (const row of rows) {
        const mem = memberships.find((m) => m.budget_id === row.id);
        if (mem) await reconcile(row, mem).catch(setError);
      }
      // Budgets deleted on another device, or no longer shared with us, are removed here too.
      // (Keeping them would re-upload them, bringing deleted budgets back.)
      const gone = Object.entries(useStore.getState().sync).filter(([, m]) => !rows.some((r) => r.id === m.remoteId));
      for (const [localId, m] of gone) {
        const name = useStore.getState().budgets[localId]?.name;
        applyRemote(() => useStore.getState().deleteBudget(localId));
        useCloud.setState({ notice: m.role === 'owner' ? `“${name}” was deleted on another device.` : `You no longer have access to “${name}”.` });
      }
      useCloud.setState({ lastSyncAt: new Date().toISOString() });
      uploadUnsynced();
    } catch (e) {
      setError(e);
    }
    // Apple Pay payments and scans logged while the app was closed.
    await importPayments().catch(setError);
    // Name, companion and notification choices saved to the account (before reminders, which depend on them).
    await pullPersonal().catch(setError);
    // Keep this device's upcoming reminders current (they depend on what's due, logged and overspent).
    void syncReminders().catch(() => {});
  } catch (e) {
    setError(e);
  } finally {
    useCloud.setState({ syncing: false, firstPullDone: true });
  }
}

async function pullOne(remoteId: string) {
  const { user } = me();
  const [{ data: row, error }, { data: mem, error: memError }] = await Promise.all([
    sb().from('shared_budgets').select('id, owner_id, version, key_version, ciphertext').eq('id', remoteId).maybeSingle(),
    sb().from('budget_members').select('budget_id, role, wrapped_key, key_version').eq('budget_id', remoteId).eq('user_id', user.id).maybeSingle(),
  ]);
  if (error || memError) throw error ?? memError;
  if (row && mem) await reconcile(row as RemoteRow, mem as Membership);
}

/** Brings one remote budget and its local copy into agreement. */
async function reconcile(row: RemoteRow, mem: Membership) {
  const { identity } = me();
  const state = useStore.getState();
  const localId = localIdFor(row.id) ?? row.id;
  const meta = state.sync[localId];
  const local = state.budgets[localId];

  let key = meta && meta.keyVersion === row.key_version ? meta.key : undefined;
  if (!key) {
    // The owner is mid-way through rotating keys; our new wrapped key will arrive shortly.
    if (mem.key_version !== row.key_version) return;
    try {
      key = b64(unwrapKey(mem.wrapped_key, identity, wrapContext(row.id, mem.key_version)));
    } catch {
      if (!locked.has(row.id)) {
        locked.set(row.id, mem);
        useCloud.setState({ locked: locked.size });
      }
      return;
    }
  }
  const nextMeta: Omit<SyncMeta, 'version' | 'base'> = { remoteId: row.id, ownerId: row.owner_id, role: mem.role, keyVersion: row.key_version, key };

  if (meta && local && meta.version === row.version) {
    if (meta.keyVersion !== row.key_version || meta.role !== mem.role) state.setSync(localId, { ...meta, ...nextMeta });
    if (!deepEqual(sharedPart(local), meta.base)) schedulePush(localId);
    return;
  }

  const remote = { ...openJSON<SharedBudget>(unb64(key), row.ciphertext, aad(row.id, row.key_version)), id: localId };
  if (!isValidBudget(withPersonal(remote, local))) throw new Error('A shared budget failed its integrity check and was not applied.');

  if (!local || !meta) {
    applyRemote(() => state.putBudget(withPersonal(remote, local), { ...nextMeta, version: row.version, base: remote }));
    return;
  }
  const merged = mergeBudgets(meta.base ?? remote, sharedPart(local), remote);
  applyRemote(() => state.putBudget(withPersonal(merged, local), { ...nextMeta, version: row.version, base: remote }));
  if (!deepEqual(merged, remote)) schedulePush(localId);
}

// ---------- push ----------

export async function pushBudget(localId: string) {
  if (inflight.has(localId)) {
    again.add(localId);
    return;
  }
  inflight.add(localId);
  try {
    const state = useStore.getState();
    const meta = state.sync[localId];
    const local = state.budgets[localId];
    if (!meta || !local) return;
    const shared = sharedPart(local);
    if (meta.base && deepEqual(shared, meta.base)) return;
    const payload = { ...shared, id: meta.remoteId };
    const ciphertext = sealJSON(unb64(meta.key), payload, aad(meta.remoteId, meta.keyVersion));
    useCloud.setState({ syncing: true });
    const { data, error } = await sb().rpc('push_budget', { p_id: meta.remoteId, p_expected: meta.version, p_ciphertext: ciphertext, p_key_version: meta.keyVersion });
    if (error) {
      if (/conflict/i.test(`${error.message} ${error.hint}`)) await pullOne(meta.remoteId);
      else throw error;
      return;
    }
    const latest = useStore.getState().sync[localId];
    if (latest) useStore.getState().setSync(localId, { ...latest, version: Number(data), base: shared });
    useCloud.setState({ lastSyncAt: new Date().toISOString(), error: null });
  } catch (e) {
    setError(e);
  } finally {
    inflight.delete(localId);
    useCloud.setState({ syncing: false });
    if (again.delete(localId)) schedulePush(localId);
  }
}

// ---------- sharing ----------

/** Uploads a budget (encrypted) and makes the current user its owner. */
export async function shareBudget(localId: string) {
  const { user, identity } = me();
  const local = useStore.getState().budgets[localId];
  if (!local) throw new Error('Budget not found');
  const remoteId = randomId();
  const key = newKey();
  const shared = sharedPart(local);
  const ciphertext = sealJSON(key, { ...shared, id: remoteId }, aad(remoteId, 1));
  const { error } = await sb().from('shared_budgets').insert({ id: remoteId, owner_id: user.id, version: 1, key_version: 1, ciphertext, updated_by: user.id });
  if (error) throw error;
  const { error: memError } = await sb()
    .from('budget_members')
    .insert({ budget_id: remoteId, user_id: user.id, role: 'owner', wrapped_key: wrapKeyFor(key, identity.publicKey, wrapContext(remoteId, 1)), key_version: 1, added_by: user.id });
  if (memError) {
    await sb().from('shared_budgets').delete().eq('id', remoteId);
    throw memError;
  }
  useStore.getState().setSync(localId, { remoteId, ownerId: user.id, role: 'owner', version: 1, keyVersion: 1, key: b64(key), base: shared });
  if (!running) startSync();
}

export async function listMembers(localId: string): Promise<Member[]> {
  const meta = useStore.getState().sync[localId];
  if (!meta) return [];
  const { data, error } = await sb().rpc('list_members', { p_budget: meta.remoteId });
  if (error) throw error;
  return data as Member[];
}

/** Gives another Plan user access by sealing the budget key to their public key. */
export async function inviteMember(localId: string, email: string) {
  const { user } = me();
  const meta = useStore.getState().sync[localId];
  if (!meta) throw new Error('Share this budget first.');
  const { data, error } = await sb().rpc('find_profile_by_email', { p_email: email });
  if (error) throw error;
  const found = (data as { id: string; public_key: string }[])[0];
  if (!found) throw new Error('No Plan account uses that email yet. Ask them to sign in to Plan once and set up encryption, then invite them again.');
  if (found.id === user.id) throw new Error('That’s you — you already have access.');
  const wrapped = wrapKeyFor(unb64(meta.key), unb64(found.public_key), wrapContext(meta.remoteId, meta.keyVersion));
  const { error: insertError } = await sb()
    .from('budget_members')
    .insert({ budget_id: meta.remoteId, user_id: found.id, role: 'editor', wrapped_key: wrapped, key_version: meta.keyVersion, added_by: user.id });
  if (insertError) throw /duplicate|unique/i.test(insertError.message) ? new Error('They already have access.') : insertError;
}

/** Removes a member, then rotates the budget key so they can't read future changes. */
export async function removeMember(localId: string, userId: string) {
  const meta = useStore.getState().sync[localId];
  if (!meta) return;
  const { error } = await sb().from('budget_members').delete().eq('budget_id', meta.remoteId).eq('user_id', userId);
  if (error) throw error;
  await rotateKey(localId);
}

async function rotateKey(localId: string) {
  await pushBudget(localId);
  const state = useStore.getState();
  const meta = state.sync[localId];
  const local = state.budgets[localId];
  if (!meta || !local) return;
  const key = newKey();
  const keyVersion = meta.keyVersion + 1;
  const shared = sharedPart(local);
  const ciphertext = sealJSON(key, { ...shared, id: meta.remoteId }, aad(meta.remoteId, keyVersion));
  const { data: version, error } = await sb().rpc('push_budget', { p_id: meta.remoteId, p_expected: meta.version, p_ciphertext: ciphertext, p_key_version: keyVersion });
  if (error) throw new Error('Someone saved changes at the same time. Pull to refresh and try removing them again.');
  const members = await listMembers(localId);
  for (const m of members) {
    const wrapped = wrapKeyFor(key, unb64(m.public_key), wrapContext(meta.remoteId, keyVersion));
    const { error: updError } = await sb().from('budget_members').update({ wrapped_key: wrapped, key_version: keyVersion }).eq('budget_id', meta.remoteId).eq('user_id', m.user_id);
    if (updError) throw updError;
  }
  state.setSync(localId, { ...meta, key: b64(key), keyVersion, version: Number(version), base: shared });
}

/** Members: stop receiving updates. The local copy stays as a personal budget. */
export async function leaveBudget(localId: string) {
  const { user } = me();
  const meta = useStore.getState().sync[localId];
  if (!meta) return;
  const { error } = await sb().from('budget_members').delete().eq('budget_id', meta.remoteId).eq('user_id', user.id);
  if (error) throw error;
  useStore.getState().setSync(localId, null);
}

/** Owners: delete the cloud copy for everyone. Every member keeps their local copy. */
export async function stopSharing(localId: string) {
  const meta = useStore.getState().sync[localId];
  if (!meta) return;
  const { error } = await sb().from('shared_budgets').delete().eq('id', meta.remoteId);
  if (error) throw error;
  useStore.getState().setSync(localId, null);
}

/**
 * Removes budgets this identity can't open from the account. Ones only this user can read are deleted;
 * ones other members can still read are just left, so their copy is untouched.
 */
export async function removeLockedBudgets() {
  const { user } = me();
  for (const [id, mem] of [...locked]) {
    let others = 0;
    if (mem.role === 'owner') {
      const { data } = await sb().rpc('list_members', { p_budget: id });
      others = ((data as Member[] | null) ?? []).filter((m) => m.user_id !== user.id).length;
    }
    const { error } =
      mem.role === 'owner' && others === 0 ? await sb().from('shared_budgets').delete().eq('id', id) : await sb().from('budget_members').delete().eq('budget_id', id).eq('user_id', user.id);
    if (error) throw error;
    locked.delete(id);
  }
  useCloud.setState({ locked: locked.size });
}

/**
 * Opens locked budgets with old identity keys (from before a password reset): re-seals the ones you own to your
 * current key and downloads them. Budgets others shared with you can only be re-sealed by their owner.
 * Returns how many were recovered and how many still need their owner.
 */
export async function recoverLockedBudgets(oldKeys: KeyPair[]): Promise<{ recovered: number; needOwner: number }> {
  const { user, identity } = me();
  let recovered = 0;
  let needOwner = 0;
  for (const [id, mem] of [...locked]) {
    const ctx = wrapContext(id, mem.key_version);
    let key: Uint8Array | null = null;
    for (const kp of oldKeys) {
      try {
        key = unwrapKey(mem.wrapped_key, kp, ctx);
        break;
      } catch {
        // Sealed to a different old key.
      }
    }
    if (!key) continue;
    if (mem.role !== 'owner') {
      needOwner++;
      continue;
    }
    const { error } = await sb().from('budget_members').update({ wrapped_key: wrapKeyFor(key, identity.publicKey, ctx) }).eq('budget_id', id).eq('user_id', user.id);
    if (error) throw error;
    locked.delete(id);
    recovered++;
  }
  useCloud.setState({ locked: locked.size });
  if (recovered) await pullAll();
  return { recovered, needOwner };
}

/** After an encryption reset: re-seal owned budgets' keys to the new identity; unlink the rest. Returns unlinked budget names. */
export async function rewrapOwnKeys(): Promise<string[]> {
  const { user, identity } = me();
  const lost: string[] = [];
  for (const [localId, meta] of Object.entries(useStore.getState().sync)) {
    if (meta.role === 'owner') {
      const wrapped = wrapKeyFor(unb64(meta.key), identity.publicKey, wrapContext(meta.remoteId, meta.keyVersion));
      const { error } = await sb().from('budget_members').update({ wrapped_key: wrapped }).eq('budget_id', meta.remoteId).eq('user_id', user.id);
      if (error) throw error;
    } else {
      lost.push(useStore.getState().budgets[localId]?.name ?? 'a budget');
      useStore.getState().setSync(localId, null);
    }
  }
  return lost;
}
