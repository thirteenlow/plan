-- Plan: Pro membership.
-- Run once in the Supabase SQL editor (after 003_payment_inbox.sql and 004_screenshot_scan.sql).
--
-- Who has Pro:
--   * anyone whose sign-in email is in pro_members (and not expired) — you add these by hand, see the bottom;
--   * a free trial of pro_trial_days() days. (007_stripe_trial.sql changes this to a trial people start themselves,
--     and adds Stripe subscriptions.)
-- The server enforces Pro for Apple Pay auto-log, screenshot capture and inviting people to a shared budget,
-- so the features can't be unlocked by editing the app.

create table if not exists public.pro_members (
  email text primary key check (email = lower(email) and email like '%@%'),
  -- null = no end date (for people you comp by hand, e.g. friends or testers)
  expires_at timestamptz,
  plan text not null default 'pro',
  note text,
  added_at timestamptz not null default now()
);
alter table public.pro_members enable row level security;
-- No policies: only the functions below (and you, in the SQL editor) touch this table.

-- Length of the free trial for new accounts. Change the number (0 turns trials off).
create or replace function public.pro_trial_days() returns int language sql immutable as $$ select 14 $$;

-- Pro (paid or trial) for a user id.
create or replace function public.is_pro(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from auth.users u
    join pro_members m on m.email = lower(u.email)
    where u.id = p_user and (m.expires_at is null or m.expires_at > now())
  ) or exists (
    select 1 from auth.users u where u.id = p_user and u.created_at > now() - make_interval(days => pro_trial_days())
  );
$$;

-- Signed-in user: their plan, for the app. plan is 'pro', 'trial' or 'free'; expires_at is null when there's no end date.
create or replace function public.my_plan() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  member pro_members;
  created timestamptz;
begin
  if auth.uid() is null then
    return json_build_object('plan', 'free', 'expires_at', null);
  end if;
  select m.* into member from auth.users u join pro_members m on m.email = lower(u.email)
  where u.id = auth.uid() and (m.expires_at is null or m.expires_at > now());
  if found then
    return json_build_object('plan', 'pro', 'expires_at', member.expires_at);
  end if;
  select u.created_at into created from auth.users u where u.id = auth.uid();
  if created > now() - make_interval(days => pro_trial_days()) then
    return json_build_object('plan', 'trial', 'expires_at', created + make_interval(days => pro_trial_days()));
  end if;
  return json_build_object('plan', 'free', 'expires_at', null);
end $$;

revoke all on function public.is_pro(uuid) from public, anon, authenticated;
grant execute on function public.is_pro(uuid) to service_role;
revoke all on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- ---------- Enforce Pro on the automation features ----------

-- Apple Pay auto-log (same as 003, plus the Pro check).
create or replace function public.log_payment(token text, amount text, merchant text default null, card text default null) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid;
  pending int;
begin
  if token is null or char_length(token) < 20 or char_length(token) > 200 then
    raise exception 'invalid key' using errcode = '28000';
  end if;
  select k.user_id into uid from inbox_keys k where k.key_hash = encode(digest(token, 'sha256'), 'hex');
  if uid is null then
    raise exception 'invalid key' using errcode = '28000';
  end if;
  if not public.is_pro(uid) then
    raise exception 'pro required' using errcode = '42501';
  end if;
  if amount is null or btrim(amount) = '' then
    raise exception 'amount is required' using errcode = '22023';
  end if;
  select count(*) into pending from payment_inbox where user_id = uid;
  if pending >= 500 then
    raise exception 'inbox is full; open Plan to import' using errcode = '54000';
  end if;
  insert into payment_inbox (user_id, amount, merchant, card)
  values (uid, left(btrim(amount), 40), left(nullif(btrim(merchant), ''), 120), left(nullif(btrim(card), ''), 120));
  return 'ok';
end $$;

-- Screenshot capture (same as 004, plus the Pro check before anything is spent on Claude).
create or replace function public.begin_scan(token text, daily_limit int default 30) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid;
  used int;
begin
  if token is null or char_length(token) < 20 or char_length(token) > 200 then
    raise exception 'invalid key' using errcode = '28000';
  end if;
  select k.user_id into uid from inbox_keys k where k.key_hash = encode(digest(token, 'sha256'), 'hex');
  if uid is null then
    raise exception 'invalid key' using errcode = '28000';
  end if;
  if not public.is_pro(uid) then
    raise exception 'pro required' using errcode = '42501';
  end if;
  if (select count(*) from payment_inbox where user_id = uid) >= 500 then
    raise exception 'inbox is full; open Plan to import' using errcode = '54000';
  end if;
  insert into scan_usage (user_id, day, scans) values (uid, current_date, 1)
  on conflict (user_id, day) do update set scans = scan_usage.scans + 1
  returning scans into used;
  if used > daily_limit then
    raise exception 'daily scan limit reached' using errcode = '54000';
  end if;
  delete from scan_usage where user_id = uid and day < current_date - 90;
  return uid;
end $$;

-- Sharing: owners can always add themselves (needed to start sharing), but inviting someone else needs Pro.
create or replace function public.caller_is_pro() returns boolean
language sql stable security definer set search_path = public as $$ select public.is_pro(auth.uid()) $$;
revoke all on function public.caller_is_pro() from public, anon;
grant execute on function public.caller_is_pro() to authenticated;

drop policy if exists "owners add members" on public.budget_members;
create policy "owners add members" on public.budget_members for insert
  with check (public.is_budget_owner(budget_id) and (user_id = auth.uid() or public.caller_is_pro()));

-- ---------- Managing Pro by hand (copy, edit and run these lines) ----------
--
-- Give Pro with no end date (friends, testers):
--   insert into public.pro_members (email, note) values (lower('someone@example.com'), 'comp')
--   on conflict (email) do update set expires_at = null, note = excluded.note;
--
-- Give Pro for one year (e.g. after a yearly payment):
--   insert into public.pro_members (email, expires_at, note) values (lower('someone@example.com'), now() + interval '1 year', 'yearly')
--   on conflict (email) do update set expires_at = excluded.expires_at, note = excluded.note;
--
-- Give Pro for one month:
--   insert into public.pro_members (email, expires_at, note) values (lower('someone@example.com'), now() + interval '1 month', 'monthly')
--   on conflict (email) do update set expires_at = excluded.expires_at, note = excluded.note;
--
-- Remove Pro:
--   delete from public.pro_members where email = lower('someone@example.com');
--
-- See everyone:
--   select email, plan, coalesce(expires_at::text, 'no end date') as until, note, added_at from public.pro_members order by added_at desc;
--
-- People are matched by the email they sign in with. Changes apply the next time their app syncs (or when they
-- tap "Refresh" on the Pro screen).
