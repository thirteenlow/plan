-- Plan: transit taps (SimplyGo and other tap-in/tap-out transit) no longer fail the Apple Pay Shortcut.
-- Run once in the Supabase SQL editor (after 005_pro.sql).
--
-- Tapping a card at a gate or on a bus runs the Wallet automation, but Wallet has no amount yet (the fare is charged
-- later). log_payment used to reject that with "amount is required", so Shortcuts showed "Automation failed" on every
-- tap. Now a call with an empty or zero amount is answered with 'skipped' and nothing is stored: the real fare is
-- logged when it's actually charged.
--
-- Also: a notification forwarded whole (the SimplyGo fare alert, sent as the amount with no card) is longer than
-- the 40 characters kept for the amount, so its full text is kept in card (up to 120) for the app to read.

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

revoke all on function public.log_payment(text, text, text, text) from public;
grant execute on function public.log_payment(text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
