-- Plan: a notification the moment Apple Pay or a screenshot scan logs a payment.
-- Run once in the Supabase SQL editor (after 003_payment_inbox.sql and 006_reminders.sql), then fill in the two
-- settings at the bottom.
--
-- When a row lands in payment_inbox, a trigger asks the send-reminders Edge Function (in the background, via pg_net)
-- to push "Payment logged" to that person's devices. Each device chooses whether it wants these and whether they
-- may show the amount and merchant (set from the app, see set_push_prefs).

create extension if not exists pg_net;

alter table public.push_subscriptions add column if not exists notify_logged boolean not null default true;
alter table public.push_subscriptions add column if not exists details boolean not null default false;

-- Signed-in user: this device's choices for instant notifications.
create or replace function public.set_push_prefs(p_endpoint text, p_logged boolean, p_details boolean) returns void
language sql security definer set search_path = public as $$
  update push_subscriptions set notify_logged = p_logged, details = p_details where endpoint = p_endpoint and user_id = auth.uid();
$$;
revoke all on function public.set_push_prefs(text, boolean, boolean) from public, anon;
grant execute on function public.set_push_prefs(text, boolean, boolean) to authenticated;

-- Where the trigger sends its request. Only the database can read this table.
create table if not exists public.push_config (
  key text primary key,
  value text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

create or replace function public.notify_payment_logged() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  fn_url text;
  secret text;
begin
  select value into fn_url from push_config where key = 'send_reminders_url';
  select value into secret from push_config where key = 'cron_secret';
  -- Not set up, or nobody to tell: do nothing (logging the payment must never fail because of this).
  if fn_url is null or secret is null or not exists (select 1 from push_subscriptions where user_id = new.user_id and notify_logged) then
    return new;
  end if;
  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := jsonb_build_object('type', 'logged', 'user_id', new.user_id, 'amount', new.amount, 'merchant', new.merchant, 'card', new.card,
      'scanned', coalesce(new.card = 'Screenshot', false) or coalesce(to_jsonb(new) ->> 'source' = 'screenshot', false))
  );
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists payment_logged_push on public.payment_inbox;
create trigger payment_logged_push after insert on public.payment_inbox for each row execute function public.notify_payment_logged();

-- ---------- Fill these in (same values as the cron job in 006_reminders.sql) ----------
-- insert into public.push_config (key, value) values
--   ('send_reminders_url', 'https://YOUR-PROJECT.supabase.co/functions/v1/send-reminders'),
--   ('cron_secret', 'YOUR-CRON-SECRET')
-- on conflict (key) do update set value = excluded.value;
