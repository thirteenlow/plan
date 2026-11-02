// Plan: sends web push notifications.
//   * Reminders: called every 5 minutes by pg_cron (supabase/006_reminders.sql); sends the queue each user's device
//     wrote and deletes what it sent.
//   * Payment logged: called straight away by a database trigger when Apple Pay or a scan logs a payment
//     (supabase/010_instant_push.sql), with { type: 'logged', user_id, amount, merchant, card, scanned }.
//
// Deploy:  supabase functions deploy send-reminders --no-verify-jwt
// Secrets: supabase secrets set CRON_SECRET=… VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:you@example.com
//          (make the VAPID keys once with: npx web-push generate-vapid-keys). Apple rejects placeholder subjects.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? '';
const PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
// What's missing, if anything (reported in the response and logs instead of failing quietly).
const setupProblem = !PUBLIC_KEY || !PRIVATE_KEY ? 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set' : !/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(SUBJECT) || /example\.com/.test(SUBJECT) ? 'VAPID_SUBJECT must be a real mailto: address or https URL' : null;
if (!setupProblem) webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);

type Target = { endpoint: string; p256dh: string; auth: string };
type Message = { title: string; body: string; url: string };

type Currency = { symbol?: string; decimals?: number; symbolFirst?: boolean; group?: string; decimal?: string; showSymbol?: boolean };

/**
 * Writes a bare amount ("61.93") the way the user's budget does ("S$61.93", "61,93 €"). Amounts that already carry
 * a symbol or letters are left as they came.
 */
export function formatAmount(raw: string | undefined, c: Currency | null | undefined): string {
  const text = (raw ?? '').trim();
  if (!text || !c || !/^-?\d+(?:[.,]\d+)?$/.test(text)) return text;
  const n = Math.abs(Number(text.replace(',', '.')));
  if (!Number.isFinite(n)) return text;
  const decimals = Math.min(Math.max(c.decimals ?? 2, 0), 4);
  const [whole, frac] = n.toFixed(decimals).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, c.group ?? ',');
  const number = frac ? `${grouped}${c.decimal ?? '.'}${frac}` : grouped;
  const symbol = c.showSymbol === false ? '' : (c.symbol ?? '');
  if (!symbol) return number;
  return c.symbolFirst === false ? `${number} ${symbol}` : `${symbol}${number}`;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Sends one message; forgets devices that have unsubscribed. Returns 'sent' | 'dropped' | the error. */
async function push(to: Target, msg: Message) {
  try {
    await webpush.sendNotification({ endpoint: to.endpoint, keys: { p256dh: to.p256dh, auth: to.auth } }, JSON.stringify(msg), { TTL: 3600, urgency: 'normal' });
    return 'sent';
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    const body = (e as { body?: string }).body;
    // 404/410: the browser unsubscribed or the app was removed.
    if (status === 404 || status === 410) {
      await admin.rpc('drop_push_subscription', { p_endpoint: to.endpoint });
      return 'dropped';
    }
    console.error('push failed', status, body ?? (e as Error).message);
    return `failed ${status ?? ''} ${body ?? (e as Error).message}`.trim();
  }
}

const tally = (results: string[]) => ({ sent: results.filter((r) => r === 'sent').length, dropped: results.filter((r) => r === 'dropped').length, errors: results.filter((r) => r.startsWith('failed')) });

Deno.serve(async (req) => {
  // Only the cron job and the database trigger may call this.
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('Forbidden', { status: 403 });
  if (setupProblem) {
    console.error(setupProblem);
    return json(500, { error: setupProblem });
  }
  const body = (await req.json().catch(() => ({}))) as { type?: string; user_id?: string; amount?: string; merchant?: string | null; card?: string | null; scanned?: boolean };

  // A payment was just logged: tell that person's devices that want it.
  if (body.type === 'logged' && body.user_id) {
    const subs = (cols: string) => admin.from('push_subscriptions').select(cols).eq('user_id', body.user_id).eq('notify_logged', true);
    let { data, error } = await subs('endpoint, p256dh, auth, details, currency');
    // 011_push_currency.sql not run yet: no currency column.
    if (error && /currency/.test(error.message)) ({ data, error } = await subs('endpoint, p256dh, auth, details'));
    if (error) return json(500, { error: error.message });
    const test = body.merchant === 'Plan connection test';
    const lead = body.scanned ? 'Receipt logged' : 'Payment logged';
    // One title line, no message: iOS adds "from Plan" underneath, so this reads as two tidy lines.
    const results = await Promise.all(
      ((data ?? []) as unknown as (Target & { details: boolean; currency?: Currency | null })[]).map((d) => {
        const what = [formatAmount(body.amount, d.currency), body.merchant ? `at ${body.merchant}` : ''].filter(Boolean).join(' ');
        return push(d, {
          title: (test ? 'Notifications are working' : d.details && what ? `${lead} · ${what}` : lead).slice(0, 80),
          body: '',
          // ?logged=1 tells the app a payment should be waiting (it says so if another device already took it).
          url: test ? '/spending' : '/spending?logged=1',
        });
      }),
    );
    return json(200, { type: 'logged', ...tally(results) });
  }

  // Reminders that are due.
  const { data, error } = await admin.rpc('claim_due_reminders');
  if (error) {
    console.error('claim_due_reminders', error.message);
    return json(500, { error: error.message });
  }
  const due = (data ?? []) as (Target & Message)[];
  const results = await Promise.all(due.map((r) => push(r, { title: r.title, body: r.body, url: r.url })));
  return json(200, { due: due.length, ...tally(results) });
});
