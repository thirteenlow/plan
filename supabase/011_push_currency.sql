-- Plan: show amounts in your currency ("S$61.93", not "61.93") in "Payment logged" notifications.
-- Run once in the Supabase SQL editor (after 010_instant_push.sql).
--
-- Apple Pay hands over a bare number and the budget is encrypted, so each device tells the server how to write
-- money: { symbol, decimals, symbolFirst, group, decimal, showSymbol } (from the budget's currency settings).

alter table public.push_subscriptions add column if not exists currency jsonb;

create or replace function public.set_push_prefs(p_endpoint text, p_logged boolean, p_details boolean, p_currency jsonb) returns void
language sql security definer set search_path = public as $$
  update push_subscriptions
  set notify_logged = p_logged,
      details = p_details,
      currency = case when jsonb_typeof(p_currency) = 'object' and length(p_currency::text) <= 300 then p_currency else currency end
  where endpoint = p_endpoint and user_id = auth.uid();
$$;
revoke all on function public.set_push_prefs(text, boolean, boolean, jsonb) from public, anon;
grant execute on function public.set_push_prefs(text, boolean, boolean, jsonb) to authenticated;

notify pgrst, 'reload schema';
