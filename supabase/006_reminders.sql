-- Plan: push notifications and reminders.
-- Run once in the Supabase SQL editor (after schema.sql). Then fill in and run the cron block at the bottom.
--
-- Budgets are end-to-end encrypted, so the server can't work out what's due. Each device does that itself and
-- uploads only a short queue of upcoming reminders (a time and a title/body that are generic by default). The
-- send-reminders Edge Function, run every 5 minutes by pg_cron, pushes the ones that are due and deletes them.

create table if not exists public.push_subscriptions (
  endpoint text primary key check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  send_at timestamptz not null,
  kind text not null check (char_length(kind) <= 20),
  title text not null check (char_length(title) <= 80),
  body text not null check (char_length(body) <= 160),
  url text not null default '/' check (url like '/%' and char_length(url) <= 100)
);
create index if not exists reminders_due on public.reminders (send_at);
create index if not exists reminders_user on public.reminders (user_id);
alter table public.reminders enable row level security;
-- No policies on either table: only the functions below touch them.

-- Signed-in user: save this browser's push subscription (re-saving moves it to the current account).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if (select count(*) from push_subscriptions where user_id = auth.uid() and endpoint <> p_endpoint) >= 10 then
    raise exception 'too many devices' using errcode = '54000';
  end if;
  insert into push_subscriptions (endpoint, user_id, p256dh, auth) values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

create or replace function public.remove_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- Signed-in user: replace their upcoming reminders with this list (from the device that synced last).
-- p_items: [{ "send_at": "...", "kind": "...", "title": "...", "body": "...", "url": "/..." }, …] (max 60).
create or replace function public.replace_reminders(p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 60 then
    raise exception 'invalid reminders' using errcode = '22023';
  end if;
  delete from reminders where user_id = auth.uid();
  insert into reminders (user_id, send_at, kind, title, body, url)
  select auth.uid(), (i ->> 'send_at')::timestamptz, left(i ->> 'kind', 20), left(i ->> 'title', 80), left(i ->> 'body', 160),
         case when coalesce(i ->> 'url', '/') like '/%' then left(coalesce(i ->> 'url', '/'), 100) else '/' end
  from jsonb_array_elements(p_items) as i
  where (i ->> 'send_at')::timestamptz between now() - interval '10 minutes' and now() + interval '35 days';
end $$;

-- Server (send-reminders): take everything due, with where to send it. Deleted as it's returned.
create or replace function public.claim_due_reminders() returns table (title text, body text, url text, endpoint text, p256dh text, auth text)
language sql security definer set search_path = public as $$
  with due as (
    delete from reminders where send_at <= now() returning user_id, title, body, url, send_at
  )
  select d.title, d.body, d.url, s.endpoint, s.p256dh, s.auth
  from due d join push_subscriptions s on s.user_id = d.user_id
  where d.send_at > now() - interval '1 hour'; -- drop anything stale (e.g. the cron job was paused)
$$;

create or replace function public.drop_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = public as $$ delete from push_subscriptions where endpoint = p_endpoint $$;

revoke all on function public.save_push_subscription(text, text, text) from public, anon;
revoke all on function public.remove_push_subscription(text) from public, anon;
revoke all on function public.replace_reminders(jsonb) from public, anon;
revoke all on function public.claim_due_reminders() from public, anon, authenticated;
revoke all on function public.drop_push_subscription(text) from public, anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;
grant execute on function public.replace_reminders(jsonb) to authenticated;
grant execute on function public.claim_due_reminders() to service_role;
grant execute on function public.drop_push_subscription(text) to service_role;

-- ---------- Run send-reminders every 5 minutes ----------
-- 1. Database → Extensions: turn on pg_cron and pg_net (or run the two lines below).
-- 2. Replace YOUR-PROJECT and YOUR-CRON-SECRET (the same value you set as the CRON_SECRET function secret), then
--    run the cron.schedule call. To stop it later: select cron.unschedule('send-reminders');
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule('send-reminders', '*/5 * * * *', $$
--   select net.http_post(
--     url := 'https://YOUR-PROJECT.supabase.co/functions/v1/send-reminders',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR-CRON-SECRET'),
--     body := '{}'::jsonb
--   );
-- $$);
