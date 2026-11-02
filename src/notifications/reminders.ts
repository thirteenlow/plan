/**
 * Works out the next week of reminders on this device (the server can't read the encrypted budget) and uploads
 * just the queue: times plus short text, generic unless "Show details" is on. send-reminders pushes them.
 */
import { getMonth, computeBudget } from '@/engine/budget';
import { petMood } from '@/engine/pet';
import { useCloud } from '@/cloud/cloudStore';
import { getSupabase } from '@/cloud/supabase';
import { syncPushPrefs } from '@/notifications/push';
import { useStore } from '@/store/store';
import type { BudgetData, ReminderPrefs } from '@/store/types';
import { addDays, currentMonth, toISO, today } from '@/utils/date';
import { formatMoney } from '@/utils/money';

export const DEFAULT_REMINDERS: ReminderPrefs = {
  on: false,
  logged: true,
  daily: true,
  dailyTime: '20:00',
  bills: true,
  review: true,
  assign: true,
  overspent: true,
  recap: true,
  quiet: true,
  quietStart: '22:00',
  quietEnd: '08:00',
  details: false,
};

/** Every half hour, for the time pickers. */
export const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

/** "20:00" → "8:00 pm". */
export function time12(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

export interface Reminder {
  send_at: string;
  kind: string;
  title: string;
  body: string;
  url: string;
}

/** A local date + HH:MM as a Date. */
const at = (iso: string, hhmm: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0);
};

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Moves a time inside quiet hours to when they end (the window may wrap past midnight, e.g. 10pm–8am). */
function outOfQuiet(t: Date, start: string, end: string) {
  const m = t.getHours() * 60 + t.getMinutes();
  const s = minutes(start);
  const e = minutes(end);
  if (s === e) return t;
  const inside = s < e ? m >= s && m < e : m >= s || m < e;
  if (!inside) return t;
  // Late-evening part of an overnight window: quiet ends tomorrow.
  const nextDay = s > e && m >= s ? 1 : 0;
  return new Date(t.getFullYear(), t.getMonth(), t.getDate() + nextDay, Math.floor(e / 60), e % 60);
}

/** The next time today or tomorrow at HH:MM that's still ahead. */
function nextAt(now: Date, hhmm: string) {
  const t = at(toISO(now), hhmm);
  return t > now ? t : at(addDays(toISO(now), 1), hhmm);
}

export function computeReminders(data: BudgetData, prefs: ReminderPrefs, now = new Date()): Reminder[] {
  if (!prefs.on) return [];
  const fmt = (m: number) => formatMoney(m, { c: data.settings.currency });
  const todayISO = toISO(now);
  const pet = data.settings.pet && !data.settings.pet.hidden ? data.settings.pet : undefined;
  const out: (Reminder & { at: Date })[] = [];
  const add = (time: Date, kind: string, title: string, generic: string, detail: string | undefined, url: string) => {
    const t = prefs.quiet ? outOfQuiet(time, prefs.quietStart ?? DEFAULT_REMINDERS.quietStart!, prefs.quietEnd ?? DEFAULT_REMINDERS.quietEnd!) : time;
    if (t <= now) return;
    out.push({ at: t, send_at: t.toISOString(), kind, title, body: (prefs.details && detail) || generic, url });
  };

  // Daily nudge, skipping today if something's already logged.
  if (prefs.daily) {
    const loggedToday = data.transactions.some((t) => t.date === todayISO);
    for (let d = loggedToday ? 1 : 0; d < 7; d++) {
      add(at(addDays(todayISO, d), prefs.dailyTime), 'daily', 'Log today’s spending', pet ? `${pet.name} wants to hear about today.` : 'Anything spent today?', undefined, '/transaction');
    }
  }

  // Bills: 9am the day before each scheduled payment in the next week.
  if (prefs.bills) {
    for (const s of data.scheduled) {
      if (s.amount >= 0 || s.nextDate < todayISO || s.nextDate > addDays(todayISO, 8)) continue;
      const payee = s.payeeId ? data.payees.find((p) => p.id === s.payeeId)?.name : undefined;
      add(at(addDays(s.nextDate, -1), '09:00'), 'bill', 'Bill due tomorrow', 'A scheduled payment is coming up.', `${payee ?? 'Payment'} · ${fmt(-s.amount)}`, '/scheduled');
    }
  }

  // Auto-logged or scanned payments waiting for review.
  const waiting = data.transactions.filter((t) => !t.approved).length;
  if (prefs.review && waiting > 0) {
    add(nextAt(now, '18:00'), 'review', 'Payments to review', 'Tap to check them in Spending.', `${waiting} waiting in Spending`, '/spending');
  }

  const month = currentMonth();
  const mb = getMonth(computeBudget(data, month), month);
  if (prefs.assign && mb.readyToAssign > 0) {
    add(nextAt(now, '10:00'), 'assign', 'Money to assign', 'Give your new money a job.', `${fmt(mb.readyToAssign)} ready to assign`, '/plan');
  }

  if (prefs.overspent) {
    const mood = petMood(data, month, today(), fmt);
    if (mb.overspentCount > 0 || mood.mood === 'worried' || mood.mood === 'stressed') {
      add(nextAt(now, '19:00'), 'overspent', pet ? `${pet.name} is worried` : 'Over budget', 'A category went over. Tap to fix it.', mood.reasons[0]?.text, '/plan');
    }
  }

  // Monthly recap on the 1st.
  if (prefs.recap) {
    const first = new Date(now.getFullYear(), now.getMonth() + 1, 1, 9, 0);
    add(first, 'recap', 'Your month in review', 'See how last month went.', undefined, '/reflect');
  }

  return out
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, 60)
    .map(({ at: _at, ...r }) => r);
}

let lastSent = '';
let lastPushPrefs = '';

/** Uploads this device's reminders for the active budget (only when they've changed). */
export async function syncReminders() {
  const sb = getSupabase();
  const state = useStore.getState();
  const data = state.activeBudgetId ? state.budgets[state.activeBudgetId] : undefined;
  if (!sb || !data || useCloud.getState().status !== 'ready') return;
  const prefs = { ...DEFAULT_REMINDERS, ...data.settings.reminders };
  // Instant "payment logged" notifications are sent by the server; it only needs this device's choices.
  const pushPrefs = JSON.stringify([prefs.on && prefs.logged !== false, prefs.details]);
  if (pushPrefs !== lastPushPrefs) {
    lastPushPrefs = pushPrefs;
    void syncPushPrefs(prefs.on && prefs.logged !== false, prefs.details).catch(() => (lastPushPrefs = ''));
  }
  const items = computeReminders(data, prefs);
  const payload = JSON.stringify(items);
  // Nothing on and nothing sent yet: no need to touch the server.
  if (payload === lastSent || (!lastSent && !prefs.on)) return;
  const { error } = await sb.rpc('replace_reminders', { p_items: items });
  if (error) {
    if (!/function .* does not exist|Could not find the function/i.test(error.message)) console.warn('[reminders]', error.message);
    return;
  }
  lastSent = payload;
}
