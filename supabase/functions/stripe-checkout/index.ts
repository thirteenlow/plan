// Plan: starts a Stripe Checkout for Plan Pro, or opens Stripe's customer portal to manage a subscription.
// Called by the signed-in app with POST { action, plan?, origin }:
//   'embedded'  → { clientSecret } for Stripe's payment form shown inside the app (web)
//   'checkout'  → { url } of a Stripe-hosted checkout page (phones, or when embedding isn't set up)
//   'portal'    → { url } of Stripe's billing page (card, invoices)
//   'status'    → { subscribed, cancelAtPeriodEnd, periodEnd, interval, amount, currency } for the Plan Pro screen
//   'cancel'    → cancels at the end of the paid period, right from Plan (optional `reason`, `comment`)
//   'resume'    → undoes a pending cancellation Stripe sends them back to `origin` (the copy of Plan they started from) when
// it's APP_URL or a localhost address; anything else falls back to APP_URL.
//
// Deploy:  supabase functions deploy stripe-checkout --no-verify-jwt   (it checks the user's session itself)
// Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_… STRIPE_PRICE_MONTHLY=price_… STRIPE_PRICE_YEARLY=price_… APP_URL=https://dearplan.vercel.app
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@23';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { httpClient: Stripe.createFetchHttpClient() });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');

/** Where to send people back to: their own copy of the app if it's ours (or a local dev server), else APP_URL. */
function returnBase(origin: unknown) {
  if (typeof origin !== 'string') return APP_URL;
  try {
    const u = new URL(origin);
    if (u.origin === new URL(APP_URL).origin) return u.origin;
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return u.origin;
  } catch {
    // fall through
  }
  return APP_URL;
}
/**
 * Someone who deleted their account and signed up again with the same email: their paid Pro (matched by email)
 * points at a subscription whose customer was linked to the old account. Link that customer to this account, and
 * the subscription too, so the webhook keeps updating it. Skipped if the customer belongs to another live account.
 */
async function reconnect(userId: string, email: string): Promise<string | undefined> {
  const { data } = await admin.from('pro_members').select('stripe_subscription_id').eq('email', email.toLowerCase()).maybeSingle();
  const subId = (data as { stripe_subscription_id?: string | null } | null)?.stripe_subscription_id;
  if (!subId) return undefined;
  const sub = await stripe.subscriptions.retrieve(subId);
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const { data: taken } = await admin.from('stripe_customers').select('user_id').eq('customer_id', customer).maybeSingle();
  if (taken) return undefined;
  const { error } = await admin.from('stripe_customers').insert({ user_id: userId, customer_id: customer });
  if (error) return undefined;
  await stripe.subscriptions.update(sub.id, { metadata: { user_id: userId } });
  return customer;
}

const PRICES: Record<string, string | undefined> ={ monthly: Deno.env.get('STRIPE_PRICE_MONTHLY'), yearly: Deno.env.get('STRIPE_PRICE_YEARLY') };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  const user = auth.user;
  if (!user?.email) return reply(401, { error: 'Sign in first.' });

  const body = (await req.json().catch(() => ({}))) as { action?: string; plan?: string; origin?: string; reason?: string; comment?: string };
  const base = returnBase(body.origin);
  try {
    const { data: row } = await admin.from('stripe_customers').select('customer_id').eq('user_id', user.id).maybeSingle();
    const customer = (row as { customer_id?: string } | null)?.customer_id ?? (await reconnect(user.id, user.email));


    if (body.action === 'portal') {
      if (!customer) return reply(400, { error: 'There’s no subscription to manage yet.' });
      const portal = await stripe.billingPortal.sessions.create({ customer, return_url: `${base}/pro` });
      return reply(200, { url: portal.url });
    }

    if (body.action === 'status' || body.action === 'cancel' || body.action === 'resume') {
      const live = customer ? (await stripe.subscriptions.list({ customer, status: 'all', limit: 10 })).data.find((s) => ['active', 'trialing', 'past_due'].includes(s.status)) : undefined;
      if (!live) return body.action === 'status' ? reply(200, { subscribed: false }) : reply(400, { error: 'There’s no active subscription.' });
      let sub = live;
      if (body.action === 'cancel') {
        const reasons = ['customer_service', 'low_quality', 'missing_features', 'other', 'switched_service', 'too_complex', 'too_expensive', 'unused'];
        sub = await stripe.subscriptions.update(live.id, {
          cancel_at_period_end: true,
          cancellation_details: {
            ...(reasons.includes(body.reason ?? '') ? { feedback: body.reason as 'other' } : {}),
            ...(body.comment ? { comment: String(body.comment).slice(0, 500) } : {}),
          },
        });
      } else if (body.action === 'resume') {
        sub = await stripe.subscriptions.update(live.id, { cancel_at_period_end: false });
      }
      // The webhook keeps pro_members in step; this answers the screen straight away.
      const item = sub.items.data[0];
      const end = item?.current_period_end;
      return reply(200, {
        subscribed: true,
        cancelAtPeriodEnd: sub.cancel_at_period_end || !!sub.cancel_at,
        periodEnd: end ? new Date(end * 1000).toISOString() : null,
        interval: item?.price?.recurring?.interval ?? null,
        amount: item?.price?.unit_amount ?? null,
        currency: item?.price?.currency ?? null,
      });
    }

    const price = PRICES[body.plan ?? ''];
    if (!price) return reply(400, { error: 'Choose monthly or yearly.' });
    if (customer) {
      const subs = await stripe.subscriptions.list({ customer, status: 'all', limit: 10 });
      if (subs.data.some((s) => ['active', 'trialing', 'past_due'].includes(s.status))) return reply(400, { error: 'You already have a subscription. Resume it from the Pro screen instead.' });
    }
    // Resubscribing with paid Pro time left (e.g. after cancelling): start charging when that time runs out, not
    // today. Stripe needs at least 48 hours of lead for this; anything shorter just starts now.
    const { data: member } = await admin.from('pro_members').select('expires_at').eq('email', user.email.toLowerCase()).maybeSingle();
    const paidUntil = Date.parse((member as { expires_at?: string | null } | null)?.expires_at ?? '');
    const startLater = paidUntil > Date.now() + 49 * 3_600_000 ? Math.floor(paidUntil / 1000) : undefined;
    const common = {
      mode: 'subscription' as const,
      line_items: [{ price, quantity: 1 }],
      // Ties the payment to this Plan account (the webhook uses these, not the email typed at checkout).
      client_reference_id: user.id,
      subscription_data: { metadata: { user_id: user.id }, ...(startLater ? { trial_end: startLater } : {}) },
      ...(customer ? { customer } : { customer_email: user.email }),
      allow_promotion_codes: true,
    };
    if (body.action === 'embedded') {
      // Shown inside the app; card payments finish without leaving the page.
      const session = await stripe.checkout.sessions.create({
        ...common,
        ui_mode: 'embedded_page',
        redirect_on_completion: 'if_required',
        return_url: `${base}/pro?checkout=success`,
      });
      return reply(200, { clientSecret: session.client_secret });
    }
    const session = await stripe.checkout.sessions.create({ ...common, success_url: `${base}/pro?checkout=success`, cancel_url: `${base}/pro` });
    return reply(200, { url: session.url });
  } catch (e) {
    console.error('stripe', (e as Error).message);
    return reply(502, { error: 'Couldn’t reach the payment provider. Try again.' });
  }
});
