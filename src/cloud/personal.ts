import { openJSON, ownDataKey, sealJSON } from '@/security/crypto';
import { useStore } from '@/store/store';
import type { BudgetSettings } from '@/store/types';
import { useCloud } from './cloudStore';
import { getIdentity } from './identity';
import { deepEqual } from './merge';
import { getSupabase } from './supabase';

/*
 * Personal settings (greeting name, companion, notification choices) are left out of the shared budget so each
 * member keeps their own. This saves them to the user's own row instead, encrypted with a key derived from their
 * identity key, so they follow the user to every device. One blob holds every budget's, keyed by the budget's
 * remote id (local ids differ per device).
 */

type Personal = Pick<BudgetSettings, 'ownerName' | 'pet' | 'reminders'>;
type Blob = Record<string, Personal>;

const CONTEXT = 'plan/personal-settings/v1';

/** What the server holds, as last read or written by this device (null: not read yet this session). */
let known: Blob | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const personalOf = (s: BudgetSettings): Personal => JSON.parse(JSON.stringify({ ownerName: s.ownerName, pet: s.pet, reminders: s.reminders })) as Personal;
const isEmpty = (p: Personal | undefined) => !p || Object.keys(p).length === 0;

/** Every budget on this device, including ones with nothing set (so clearing a choice is saved too). */
function localBlob(): Blob {
  const { budgets, sync } = useStore.getState();
  const out: Blob = {};
  for (const [id, meta] of Object.entries(sync)) {
    const s = budgets[id]?.settings;
    if (s) out[meta.remoteId] = personalOf(s);
  }
  return out;
}

const compact = (blob: Blob): Blob => Object.fromEntries(Object.entries(blob).filter(([, p]) => !isEmpty(p)));

function session() {
  const sb = getSupabase();
  const user = useCloud.getState().user;
  const identity = getIdentity();
  if (!sb || !user || !identity) return null;
  return { sb, user, key: ownDataKey(identity, CONTEXT), aad: `${CONTEXT}/${user.id}` };
}

/** The table comes from supabase/009_personal_settings.sql; until it's run, personal settings stay on each device. */
const missingTable = (message: string) => /does not exist|Could not find the table/i.test(message);

/** Downloads the user's personal settings, merges them with this device's, and saves the result both ways. */
export async function pullPersonal() {
  const s = session();
  if (!s) return;
  const { data, error } = await s.sb.from('personal_settings').select('ciphertext').eq('user_id', s.user.id).maybeSingle();
  if (error) {
    if (missingTable(error.message)) return;
    throw error;
  }
  let remote: Blob = {};
  if (data) {
    try {
      remote = openJSON<Blob>(s.key, (data as { ciphertext: string }).ciphertext, s.aad);
    } catch {
      // Saved with an identity key from before a password reset: replaced with this device's below.
    }
  }
  const local = localBlob();
  const merged: Blob = { ...remote };
  for (const [remoteId, mine] of Object.entries(local)) {
    const theirs = remote[remoteId];
    // First read this session: the account's copy wins (a new device has nothing of its own yet).
    // After that, whichever side changed since the last read wins; if both did, this device's.
    if (!theirs) merged[remoteId] = mine;
    else if (known && !deepEqual(mine, known[remoteId] ?? {})) merged[remoteId] = mine;
  }

  // Apply the merged choices to this device's budgets.
  const { budgets, sync } = useStore.getState();
  const updates: typeof budgets = {};
  for (const [id, meta] of Object.entries(sync)) {
    const b = budgets[id];
    const want = merged[meta.remoteId];
    if (!b || !want || deepEqual(personalOf(b.settings), want)) continue;
    updates[id] = { ...b, settings: { ...b.settings, ownerName: want.ownerName, pet: want.pet, reminders: want.reminders } };
  }
  if (Object.keys(updates).length) useStore.setState((st) => ({ budgets: { ...st.budgets, ...updates } }));

  known = remote;
  const next = compact(merged);
  if (!deepEqual(next, remote)) await save(next);
}

async function save(blob: Blob) {
  const s = session();
  if (!s) return;
  const { error } = await s.sb.from('personal_settings').upsert({ user_id: s.user.id, ciphertext: sealJSON(s.key, blob, s.aad), updated_at: new Date().toISOString() });
  if (error) {
    if (missingTable(error.message)) return;
    throw error;
  }
  known = blob;
}

/** Called on every local budget change: uploads personal settings shortly after they change. */
export function schedulePersonalPush() {
  if (known === null) return; // wait for the first download, so a fresh device doesn't overwrite the account's copy
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (known === null) return;
    const blob = compact({ ...known, ...localBlob() });
    if (!deepEqual(blob, known)) void save(blob).catch((e) => console.warn('[personal settings]', e));
  }, 1500);
}

/** Signing out: forget what was read, so the next account starts from its own copy. */
export function resetPersonal() {
  if (timer) clearTimeout(timer);
  timer = null;
  known = null;
}
