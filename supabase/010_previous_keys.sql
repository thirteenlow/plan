-- Keeps the encrypted key backup from before a password reset, so budgets that weren't on the device that reset
-- can still be opened if the old password turns up later. Each row is still locked with that old password
-- (same protection as profiles.encrypted_private_key); the server can't read it.
-- Run once in the SQL editor, after schema.sql.

create table if not exists public.previous_keys (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  public_key text not null check (char_length(public_key) < 200),
  encrypted_private_key text not null check (char_length(encrypted_private_key) < 1000),
  kdf jsonb not null,
  replaced_at timestamptz not null default now()
);
create index if not exists previous_keys_user_idx on public.previous_keys (user_id);

alter table public.previous_keys enable row level security;

drop policy if exists "read own previous keys" on public.previous_keys;
create policy "read own previous keys" on public.previous_keys for select using (user_id = auth.uid());
drop policy if exists "save own previous keys" on public.previous_keys;
create policy "save own previous keys" on public.previous_keys for insert with check (user_id = auth.uid());
drop policy if exists "remove own previous keys" on public.previous_keys;
create policy "remove own previous keys" on public.previous_keys for delete using (user_id = auth.uid());
