// Plan: Stripe webhook. Keeps pro_members in step with each subscription: Pro until the end of the paid period
// (plus a few days' grace while Stripe retries a failed card), and off when it's cancelled or unpaid.
//
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt   (Stripe signs its requests instead)
// Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_… STRIPE_WEBHOOK_SECRET=whsec_…
// In Stripe → Developers → Webhooks, add https://YOUR-PROJECT.supabase.co/functions/v1/stripe-webhook with the events
// checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted.
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@23';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { httpClient: Stripe.createFetchHttpClient() });
const crypto = Stripe.createSubtleCryptoProvider();
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const GRACE_DAYS = 3;
const DAY = 86_400_000;

/** Writes one subscription's state to the database. */
async function apply(sub: Stripe.Subscription, userHint?: string | null) {
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  let userId: string | undefined = userHint || sub.metadata?.user_id;
  if (!userId) {
    const { data } = await admin.from('stripe_customers').select('user_id').eq('customer_id', customer).maybeSingle();
    userId = (data as { user_id?: string } | null)?.user_id;
  }
  if (!userId) return console.warn('no Plan account for', customer);

  // The billing period lives on the subscription item in current Stripe API versions.
  const item = sub.items.data[0];
  const periodEnd = item?.current_period_end ? item.current_period_end * 1000 : Date.now();
  const live = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due';
  const expires = live ? new Date(periodEnd + GRACE_DAYS * DAY) : new Date();
  const plan = item?.price?.recurring?.interval === 'year' ? 'yearly' : 'monthly';

  const { error } = await admin.rpc('set_pro_from_stripe', { p_user: userId, p_customer: customer, p_subscription: sub.id, p_expires: expires.toISOString(), p_plan: plan });
  if (error) throw new Error(error.message);
}

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature ?? '', Deno.env.get('STRIPE_WEBHOOK_SECRET')!, undefined, crypto);
  } catch (e) {
    console.warn('bad signature', (e as Error).message);
    return new Response('Bad signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          const id = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
          await apply(await stripe.subscriptions.retrieve(id), session.client_reference_id);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await apply(event.data.object);
        break;
    }
  } catch (e) {
    // A 500 makes Stripe retry later.
    console.error('webhook', event.type, (e as Error).message);
    return new Response('Error', { status: 500 });
  }
  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
});
