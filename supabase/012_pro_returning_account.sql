-- Plan: Pro for someone who deleted their account and signed up again with the same email.
-- Run once in the Supabase SQL editor (after 007_stripe_trial.sql).
--
-- Pro is matched by email (pro_members), but the link to the Stripe customer (stripe_customers) is by account id
-- and goes away with the old account. Until stripe-checkout reconnects them, the returning account counts as
-- "managed" whenever its Pro came from Stripe, so the app asks for the subscription (which reconnects it) and
-- shows Manage billing / Resume instead of nothing.

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
    managed := managed or member.stripe_subscription_id is not null;
    return json_build_object('plan', 'pro', 'expires_at', member.expires_at, 'trial_available', false, 'managed', managed);
  end if;
  if trial.user_id is not null and trial.started_at > now() - make_interval(days => pro_trial_days()) then
    return json_build_object('plan', 'trial', 'expires_at', trial.started_at + make_interval(days => pro_trial_days()), 'trial_available', false, 'managed', managed);
  end if;
  return json_build_object('plan', 'free', 'expires_at', null, 'trial_available', trial.user_id is null and pro_trial_days() > 0, 'managed', managed);
end $$;
