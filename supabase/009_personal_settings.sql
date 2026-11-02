-- Plan: personal settings that follow a person to every device (greeting name, companion, notification choices).
-- Run once in the Supabase SQL editor (after schema.sql).
--
-- These stay out of the shared budget (members of a shared budget each keep their own), so each user gets one row,
-- encrypted on the device with a key derived from their identity key. The server only sees ciphertext.

create table if not exists public.personal_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ciphertext text not null check (char_length(ciphertext) <= 20000),
  updated_at timestamptz not null default now()
);
alter table public.personal_settings enable row level security;

drop policy if exists "read own personal settings" on public.personal_settings;
create policy "read own personal settings" on public.personal_settings for select using (user_id = auth.uid());
drop policy if exists "create own personal settings" on public.personal_settings;
create policy "create own personal settings" on public.personal_settings for insert with check (user_id = auth.uid());
drop policy if exists "update own personal settings" on public.personal_settings;
create policy "update own personal settings" on public.personal_settings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
