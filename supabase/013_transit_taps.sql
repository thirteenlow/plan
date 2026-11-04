-- Plan: transit taps (SimplyGo and other tap-in/tap-out transit) no longer fail the Apple Pay Shortcut.
-- Run once in the Supabase SQL editor (after 005_pro.sql; also after 010_instant_push.sql if you ran it).
--
-- Tapping a card at a gate or on a bus runs the Wallet automation, but Wallet has no amount yet (the fare is charged
-- later). log_payment used to reject that with "amount is required", so Shortcuts showed "Automation failed" on every
-- tap. Now an empty or zero amount is kept as a tap (amount '') and the app turns each day's taps into one estimated
-- transaction (src/utils/transit.ts). Taps don't send a "Payment logged" notification.

create or replace function public.log_payment(token text, amount text, merchant text default null, card text default null) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid;
  pending int;
  tap boolean := coalesce(amount, '') !~ '[1-9]';
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
  select count(*) into pending from payment_inbox where user_id = uid;
  if pending >= 500 then
    -- A tap must never make the Shortcut fail; a real payment should, so the person notices.
    if tap then return 'skipped'; end if;
    raise exception 'inbox is full; open Plan to import' using errcode = '54000';
  end if;
  insert into payment_inbox (user_id, amount, merchant, card)
  values (uid, case when tap then '' else left(btrim(amount), 40) end, left(nullif(btrim(merchant), ''), 120), left(nullif(btrim(card), ''), 120));
  return case when tap then 'tap' else 'ok' end;
end $$;

revoke all on function public.log_payment(text, text, text, text) from public;
grant execute on function public.log_payment(text, text, text, text) to anon, authenticated;

-- No "Payment logged" push for taps (only if 010_instant_push.sql was run).
do $$
begin
  if exists (select 1 from pg_proc where proname = 'notify_payment_logged' and pronamespace = 'public'::regnamespace) then
    drop trigger if exists payment_logged_push on public.payment_inbox;
    create trigger payment_logged_push after insert on public.payment_inbox for each row
      when (new.amount ~ '[1-9]') execute function public.notify_payment_logged();
  end if;
end $$;

notify pgrst, 'reload schema';
