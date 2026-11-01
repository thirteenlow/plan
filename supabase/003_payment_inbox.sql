-- Plan: Apple Pay auto-logging inbox.
-- Run once in the Supabase SQL editor (after schema.sql).
--
-- How it works: an iPhone Shortcuts automation ("When I tap a Wallet card") calls log_payment() with the
-- user's personal inbox key, the amount, the merchant and the card name. The row waits here until the
-- app next opens, claims it (claim_payments deletes and returns in one step, so two devices can't both
-- import it), and saves it into the encrypted budget.
--
-- Unlike budgets, these rows are NOT end-to-end encrypted (Shortcuts can't encrypt), so they're kept as
-- short as possible: only amount / merchant / card, deleted the moment the app imports them.

create table if not exists public.inbox_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- sha256 of the key; the key itself only lives on the user's devices and in their Shortcut
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.inbox_keys enable row level security;
-- No policies: only the functions below touch this table.

create table if not exists public.payment_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount text not null check (char_length(amount) <= 40),
  merchant text check (char_length(merchant) <= 120),
  card text check (char_length(card) <= 120),
  created_at timestamptz not null default now()
);
create index if not exists payment_inbox_user on public.payment_inbox (user_id, created_at);
alter table public.payment_inbox enable row level security;
-- No policies either: reading happens through claim_payments(), writing through log_payment().

-- Signed-in user: store (or replace) the hash of their inbox key.
create or replace function public.set_inbox_key(p_hash text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid key hash' using errcode = '22023';
  end if;
  insert into inbox_keys (user_id, key_hash) values (auth.uid(), p_hash)
  on conflict (user_id) do update set key_hash = excluded.key_hash, created_at = now();
end $$;

-- Signed-in user: turn auto-logging off (removes the key and anything still waiting).
create or replace function public.remove_inbox_key() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from inbox_keys where user_id = auth.uid();
  delete from payment_inbox where user_id = auth.uid();
end $$;

-- Called by the Shortcut (no sign-in; the inbox key identifies the user).
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

-- Signed-in user: take everything waiting (deleted as it's returned).
create or replace function public.claim_payments() returns setof public.payment_inbox
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return query delete from payment_inbox where user_id = auth.uid() returning *;
end $$;

revoke all on function public.set_inbox_key(text) from public, anon;
revoke all on function public.remove_inbox_key() from public, anon;
revoke all on function public.claim_payments() from public, anon;
revoke all on function public.log_payment(text, text, text, text) from public;
grant execute on function public.set_inbox_key(text) to authenticated;
grant execute on function public.remove_inbox_key() to authenticated;
grant execute on function public.claim_payments() to authenticated;
grant execute on function public.log_payment(text, text, text, text) to anon, authenticated;
