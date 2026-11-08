-- Plan: an account can have several inbox keys (one per device), so making a key on one device no longer turns off
-- the others or the iPhone shortcuts that use them. Run once in the Supabase SQL editor (after 015_email_alerts.sql).
--
-- Before this, set_inbox_key replaced the account's one key: a phone or computer without the key saved made a new
-- one (e.g. scanning a receipt there), and every shortcut using the old key got "Key not accepted". Now it adds the
-- key, and each device adds its own again when Plan opens, so old keys come back on their own.
-- log_payment and begin_scan already look a key up by its hash, so they work unchanged.

alter table public.inbox_keys drop constraint if exists inbox_keys_pkey;
alter table public.inbox_keys add column if not exists id uuid not null default gen_random_uuid();
alter table public.inbox_keys add primary key (id);
create index if not exists inbox_keys_user on public.inbox_keys (user_id, created_at);

-- Signed-in user: add a key (or mark one they already have as just used). Keeps the 20 most recent.
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
  on conflict (key_hash) do update set created_at = now() where inbox_keys.user_id = auth.uid();
  delete from inbox_keys
  where user_id = auth.uid()
    and id not in (select id from inbox_keys where user_id = auth.uid() order by created_at desc limit 20);
end $$;

notify pgrst, 'reload schema';
