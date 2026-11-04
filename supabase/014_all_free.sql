-- Plan: every feature is free. Removes Plan Pro, the free trial and Stripe.
-- Run once in the Supabase SQL editor (after 013_transit_taps.sql).
--
-- Tap-to-pay auto-log, receipt scans and inviting people no longer check for Pro, and the Pro and Stripe tables
-- and functions are dropped. Then delete the stripe-checkout and stripe-webhook Edge Functions and their secrets
-- (see the bottom).

-- ---------- Auto-log: same as 013, without the Pro check ----------

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
  -- A transit tap: no fare yet. Succeed quietly so the Shortcut doesn't report a failure.
  if coalesce(amount, '') !~ '[1-9]' then
    return 'skipped';
  end if;
  select count(*) into pending from payment_inbox where user_id = uid;
  if pending >= 500 then
    raise exception 'inbox is full; open Plan to import' using errcode = '54000';
  end if;
  if nullif(btrim(card), '') is null and char_length(btrim(amount)) > 40 then
    card := btrim(amount);
  end if;
  insert into payment_inbox (user_id, amount, merchant, card)
  values (uid, left(btrim(amount), 40), left(nullif(btrim(merchant), ''), 120), left(nullif(btrim(card), ''), 120));
  return 'ok';
end $$;

-- ---------- Receipt scans: same as 005, without the Pro check (the daily limit stays) ----------

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

-- ---------- Sharing: owners can invite anyone (as in schema.sql) ----------

drop policy if exists "owners add members" on public.budget_members;
create policy "owners add members" on public.budget_members for insert with check (public.is_budget_owner(budget_id));

-- ---------- Drop Pro, trials and Stripe ----------

drop function if exists public.set_pro_from_stripe(uuid, text, text, timestamptz, text);
drop function if exists public.start_trial();
drop function if exists public.my_plan();
drop function if exists public.caller_is_pro();
drop function if exists public.is_pro(uuid);
drop function if exists public.pro_trial_days();
drop table if exists public.stripe_customers;
drop table if exists public.pro_trials;
drop table if exists public.pro_members;

notify pgrst, 'reload schema';

-- ---------- Then, in a terminal ----------
--
--   supabase functions delete stripe-checkout
--   supabase functions delete stripe-webhook
--   supabase secrets unset STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_MONTHLY STRIPE_PRICE_YEARLY
--
-- In Stripe: cancel any live subscriptions and delete the webhook endpoint.
