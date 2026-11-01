// Plan: sends due reminders as web push notifications. Called every 5 minutes by pg_cron (see
// supabase/006_reminders.sql); the queue itself is written by each user's device.
//
// Deploy:  supabase functions deploy send-reminders --no-verify-jwt
// Secrets: supabase secrets set CRON_SECRET=… VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:you@example.com
//          (make the VAPID keys once with: npx web-push generate-vapid-keys)
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

type Due = { title: string; body: string; url: string; endpoint: string; p256dh: string; auth: string };

Deno.serve(async (req) => {
  // Only the cron job may trigger sends.
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('Forbidden', { status: 403 });

  const { data, error } = await admin.rpc('claim_due_reminders');
  if (error) {
    console.error('claim_due_reminders', error.message);
    return new Response('Server error', { status: 500 });
  }
  const due = (data ?? []) as Due[];
  let sent = 0;
  let dropped = 0;
  await Promise.all(
    due.map(async (r) => {
      try {
        await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, JSON.stringify({ title: r.title, body: r.body, url: r.url }), { TTL: 3600, urgency: 'normal' });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404/410: the browser unsubscribed or the app was removed; forget this device.
        if (status === 404 || status === 410) {
          dropped++;
          await admin.rpc('drop_push_subscription', { p_endpoint: r.endpoint });
        } else console.error('push failed', status, (e as Error).message);
      }
    }),
  );
  return new Response(JSON.stringify({ due: due.length, sent, dropped }), { headers: { 'Content-Type': 'application/json' } });
});
