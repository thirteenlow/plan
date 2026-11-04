-- Plan: bank alert emails (e.g. DBS PayLah! "Transaction Alerts") through the auto-log Shortcut.
-- Run once in the Supabase SQL editor (after 014_all_free.sql).
--
-- An iPhone "When I receive an email" automation sends the whole email as the amount. Only 40 characters of the
-- amount are kept, which is just the greeting, so the full text (up to 2,000 characters) is now kept in `details`
-- for the app to read the "Amount:" and "To:" lines from. Like everything in the inbox it's deleted once claimed.

alter table public.payment_inbox add column if not exists details text check (char_length(details) <= 2000);

-- Same as 014, plus `details` for long amounts.
create or replace function public.log_payment(token text, amount text, merchant text default null, card text default null) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid;
  pending int;
  full_text text;
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
  if char_length(btrim(amount)) > 40 then
    full_text := left(btrim(amount), 2000);
  end if;
  if nullif(btrim(card), '') is null and char_length(btrim(amount)) > 40 then
    card := btrim(amount);
  end if;
  insert into payment_inbox (user_id, amount, merchant, card, details)
  values (uid, left(btrim(amount), 40), left(nullif(btrim(merchant), ''), 120), left(nullif(btrim(card), ''), 120), full_text);
  return 'ok';
end $$;

notify pgrst, 'reload schema';
