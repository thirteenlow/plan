import { openJSON, ownDataKey, sealJSON } from '@/security/crypto';
import { useStore } from '@/store/store';
import type { BudgetData, BudgetSettings } from '@/store/types';
import { useCloud } from './cloudStore';
import { getIdentity } from './identity';
import { deepEqual } from './merge';
import { getSupabase } from './supabase';

/*
 * Personal settings (greeting name, companion, notification choices) are left out of the shared budget so each
 * member keeps their own. This saves them to the user's own row instead, encrypted with a key derived from their
 * identity key, so they follow the user to every device. One blob holds every budget's, keyed by the budget's
 * remote id (local ids differ per device). It also keeps when each budget was last opened, so signing in again
 * reopens the budget you were last using rather than whichever downloads first.
 */

type Personal = Pick<BudgetSettings, 'ownerName' | 'pet' | 'reminders'> & { openedAt?: string };
type Blob = Record<string, Personal>;

const CONTEXT = 'plan/personal-settings/v1';

/** What the server holds, as last read or written by this device (null: not read yet this session). */
let known: Blob | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const personalOf = (b: BudgetData): Personal =>
  JSON.parse(JSON.stringify({ ownerName: b.settings.ownerName, pet: b.settings.pet, reminders: b.settings.reminders, openedAt: b.lastOpenedAt || undefined })) as Personal;
const isEmpty = (p: Personal | undefined) => !p || Object.keys(p).length === 0;
/** The choices themselves, without the last-opened time (which is merged separately: the later one wins). */
const choices = ({ openedAt: _o, ...rest }: Personal) => rest;
const later = (a?: string, b?: string) => (!a ? b : !b ? a : a > b ? a : b);

/** Every budget on this device, including ones with nothing set (so clearing a choice is saved too). */
function localBlob(): Blob {
  const { budgets, sync } = useStore.getState();
  const out: Blob = {};
  for (const [id, meta] of Object.entries(sync)) {
    const b = budgets[id];
    if (b) out[meta.remoteId] = personalOf(b);
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
  const first = known === null;
  const local = localBlob();
  const merged: Blob = { ...remote };
  for (const [remoteId, mine] of Object.entries(local)) {
    const theirs = remote[remoteId];
    // First read this session: the account's copy wins (a new device has nothing of its own yet).
    // After that, whichever side changed since the last read wins; if both did, this device's.
    let pick = theirs ?? mine;
    if (theirs && known && !deepEqual(choices(mine), choices(known[remoteId] ?? {}))) pick = mine;
    // A budget that just downloaded counts as opened "now" here, so on the first read the account's time wins.
    const openedAt = first && theirs?.openedAt ? theirs.openedAt : later(mine.openedAt, theirs?.openedAt);
    merged[remoteId] = { ...choices(pick), ...(openedAt ? { openedAt } : {}) };
  }

  // Apply the merged choices to this device's budgets.
  const { budgets, sync } = useStore.getState();
  const updates: typeof budgets = {};
  for (const [id, meta] of Object.entries(sync)) {
    const b = budgets[id];
    const want = merged[meta.remoteId];
    if (!b || !want || deepEqual(personalOf(b), want)) continue;
    updates[id] = { ...b, lastOpenedAt: want.openedAt ?? b.lastOpenedAt, settings: { ...b.settings, ownerName: want.ownerName, pet: want.pet, reminders: want.reminders } };
  }
  if (Object.keys(updates).length) useStore.setState((st) => ({ budgets: { ...st.budgets, ...updates } }));
  // Just signed in: open the budget used most recently on any device.
  if (first) openLastUsed();

  known = remote;
  const next = compact(merged);
  if (!deepEqual(next, remote)) await save(next);
}

function openLastUsed() {
  const { budgets, sync, activeBudgetId, switchBudget } = useStore.getState();
  const last = Object.keys(sync)
    .map((id) => budgets[id])
    .filter(Boolean)
    .sort((a, b) => (a.lastOpenedAt < b.lastOpenedAt ? 1 : -1))[0];
  if (last && last.id !== activeBudgetId) switchBudget(last.id);
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
