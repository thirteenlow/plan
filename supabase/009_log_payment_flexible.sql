-- Plan: make the Apple Pay shortcut forgiving. Run once in the Supabase SQL editor (after 003/005).
--
-- log_payment(token, amount, merchant, card) only matches when the shortcut's JSON keys are exactly those four,
-- in lowercase. Shortcuts capitalises what you type ("Amount"), and an extra or misnamed field makes the whole call
-- fail with "Could not find the function", which Shortcuts doesn't report. This overload takes the request body as
-- one JSON object, so the database API falls back to it whenever the keys don't match exactly: it reads the keys in
-- any case, accepts a few common alternatives, ignores anything else, and hands over to the original function
-- (which does all the checks: key, Pro, limits).

create or replace function public.log_payment(jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  k text;
  v jsonb;
  p_token text;
  p_amount text;
  p_merchant text;
  p_card text;
begin
  if jsonb_typeof($1) <> 'object' then
    raise exception 'send a JSON object' using errcode = '22023';
  end if;
  for k, v in select key, value from jsonb_each($1) loop
    case regexp_replace(lower(k), '[^a-z]', '', 'g')
      when 'token' then p_token := v #>> '{}';
      when 'key' then p_token := coalesce(p_token, v #>> '{}');
      when 'amount' then p_amount := v #>> '{}';
      when 'total' then p_amount := coalesce(p_amount, v #>> '{}');
      when 'merchant' then p_merchant := v #>> '{}';
      when 'store' then p_merchant := coalesce(p_merchant, v #>> '{}');
      when 'card' then p_card := v #>> '{}';
      when 'name' then p_card := coalesce(p_card, v #>> '{}');
      when 'cardorpass' then p_card := coalesce(p_card, v #>> '{}');
      else null;
    end case;
  end loop;
  return public.log_payment(p_token, p_amount, p_merchant, p_card);
end $$;

revoke all on function public.log_payment(jsonb) from public;
grant execute on function public.log_payment(jsonb) to anon, authenticated;

-- Make the database API notice the new function right away.
notify pgrst, 'reload schema';
