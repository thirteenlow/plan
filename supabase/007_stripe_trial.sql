-- Plan: opt-in free trial and Stripe subscriptions.
-- Run once in the Supabase SQL editor (after 005_pro.sql). Replaces 005's automatic trial for new accounts:
-- people now start their trial themselves (once per account), and Stripe turns Pro on and off automatically.

-- ---------- Opt-in trial ----------

create table if not exists public.pro_trials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  started_at timestamptz not null default now()
);
alter table public.pro_trials enable row level security;
-- No policies: only start_trial() and the checks below touch it.

-- ---------- Stripe ----------

create table if not exists public.stripe_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  customer_id text not null unique check (customer_id like 'cus_%')
);
alter table public.stripe_customers enable row level security;

alter table public.pro_members add column if not exists stripe_subscription_id text;

-- Pro: a current pro_members row (paid via Stripe, or added by hand), or a trial started in the last pro_trial_days().
create or replace function public.is_pro(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from auth.users u
    join pro_members m on m.email = lower(u.email)
    where u.id = p_user and (m.expires_at is null or m.expires_at > now())
  ) or exists (
    select 1 from pro_trials t where t.user_id = p_user and t.started_at > now() - make_interval(days => pro_trial_days())
  );
$$;

-- Signed-in user: their plan for the app.
--   plan: 'pro' | 'trial' | 'free'; expires_at: when it ends (null = no end date);
--   trial_available: they've never started a trial and don't have Pro; managed: they have a Stripe subscription to manage.
create or replace function public.my_plan() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  member pro_members;
  trial pro_trials;
  managed boolean;
begin
  if auth.uid() is null then
    return json_build_object('plan', 'free', 'expires_at', null, 'trial_available', false, 'managed', false);
  end if;
  managed := exists (select 1 from stripe_customers where user_id = auth.uid());
  select t.* into trial from pro_trials t where t.user_id = auth.uid();
  select m.* into member from auth.users u join pro_members m on m.email = lower(u.email)
  where u.id = auth.uid() and (m.expires_at is null or m.expires_at > now());
  if member.email is not null then
    return json_build_object('plan', 'pro', 'expires_at', member.expires_at, 'trial_available', false, 'managed', managed);
  end if;
  if trial.user_id is not null and trial.started_at > now() - make_interval(days => pro_trial_days()) then
    return json_build_object('plan', 'trial', 'expires_at', trial.started_at + make_interval(days => pro_trial_days()), 'trial_available', false, 'managed', managed);
  end if;
  return json_build_object('plan', 'free', 'expires_at', null, 'trial_available', trial.user_id is null and pro_trial_days() > 0, 'managed', managed);
end $$;

-- Signed-in user: start their one free trial.
create or replace function public.start_trial() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if pro_trial_days() <= 0 then
    raise exception 'trials are off' using errcode = '22023';
  end if;
  if exists (select 1 from pro_trials where user_id = auth.uid()) then
    raise exception 'trial already used' using errcode = '23505';
  end if;
  insert into pro_trials (user_id) values (auth.uid());
end $$;

-- Server (stripe-webhook): record a subscription's state. p_expires is when Pro should end (null never happens
-- here). Rows you added by hand with no end date are left alone.
create or replace function public.set_pro_from_stripe(p_user uuid, p_customer text, p_subscription text, p_expires timestamptz, p_plan text) returns void
language plpgsql security definer set search_path = public as $$
declare
  mail text;
begin
  select lower(email) into mail from auth.users where id = p_user;
  if mail is null then
    return;
  end if;
  insert into stripe_customers (user_id, customer_id) values (p_user, p_customer)
  on conflict (user_id) do update set customer_id = excluded.customer_id;
  insert into pro_members (email, expires_at, plan, note, stripe_subscription_id)
  values (mail, p_expires, coalesce(p_plan, 'pro'), 'stripe', p_subscription)
  on conflict (email) do update
    set expires_at = excluded.expires_at, plan = excluded.plan, note = 'stripe', stripe_subscription_id = excluded.stripe_subscription_id
    where pro_members.expires_at is not null or pro_members.stripe_subscription_id is not null;
end $$;

revoke all on function public.start_trial() from public, anon;
grant execute on function public.start_trial() to authenticated;
revoke all on function public.set_pro_from_stripe(uuid, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.set_pro_from_stripe(uuid, text, text, timestamptz, text) to service_role;
