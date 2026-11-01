-- Plan: shared, end-to-end encrypted budgets.
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query).
--
-- The server never sees budget contents: `shared_budgets.ciphertext` is encrypted on the device with a
-- per-budget key, and that key is stored per member in `budget_members.wrapped_key`, sealed to the
-- member's X25519 public key. Private keys are only stored encrypted with the user's passphrase.

create extension if not exists pgcrypto;

-- ---------- Tables ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (char_length(email) <= 320),
  display_name text check (char_length(display_name) <= 80),
  public_key text not null check (char_length(public_key) between 40 and 64),
  encrypted_private_key text not null check (char_length(encrypted_private_key) < 400),
  kdf jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_email_idx on public.profiles (lower(email));

create table if not exists public.shared_budgets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  version bigint not null default 1,
  key_version int not null default 1,
  ciphertext text not null check (char_length(ciphertext) < 20000000),
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budget_members (
  budget_id uuid not null references public.shared_budgets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor')),
  wrapped_key text not null check (char_length(wrapped_key) < 400),
  key_version int not null,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (budget_id, user_id)
);

alter table public.profiles enable row level security;
alter table public.shared_budgets enable row level security;
alter table public.budget_members enable row level security;

-- ---------- Helpers (security definer avoids recursive RLS checks) ----------

create or replace function public.is_budget_member(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from budget_members where budget_id = b and user_id = auth.uid());
$$;

create or replace function public.is_budget_owner(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from shared_budgets where id = b and owner_id = auth.uid());
$$;

-- ---------- Row-level security ----------

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (id = auth.uid());
drop policy if exists "create own profile" on public.profiles;
create policy "create own profile" on public.profiles for insert with check (id = auth.uid());
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "members read budgets" on public.shared_budgets;
create policy "members read budgets" on public.shared_budgets for select using (owner_id = auth.uid() or public.is_budget_member(id));
drop policy if exists "owners create budgets" on public.shared_budgets;
create policy "owners create budgets" on public.shared_budgets for insert with check (owner_id = auth.uid());
drop policy if exists "owners delete budgets" on public.shared_budgets;
create policy "owners delete budgets" on public.shared_budgets for delete using (owner_id = auth.uid());
-- No UPDATE policy: all writes go through push_budget() so versions are always checked.

drop policy if exists "members read members" on public.budget_members;
create policy "members read members" on public.budget_members for select using (public.is_budget_member(budget_id));
drop policy if exists "owners add members" on public.budget_members;
create policy "owners add members" on public.budget_members for insert with check (public.is_budget_owner(budget_id));
drop policy if exists "owners rotate keys" on public.budget_members;
create policy "owners rotate keys" on public.budget_members for update using (public.is_budget_owner(budget_id)) with check (public.is_budget_owner(budget_id));
drop policy if exists "owners remove members, members leave" on public.budget_members;
create policy "owners remove members, members leave" on public.budget_members for delete
  using ((public.is_budget_owner(budget_id) and user_id <> auth.uid()) or (user_id = auth.uid() and role <> 'owner'));

-- ---------- RPCs ----------

-- Optimistic concurrency: the write only succeeds if nobody else saved since `p_expected`.
create or replace function public.push_budget(p_id uuid, p_expected bigint, p_ciphertext text, p_key_version int)
returns bigint language plpgsql security definer set search_path = public as $$
declare new_version bigint;
begin
  if auth.uid() is null or not public.is_budget_member(p_id) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  if char_length(p_ciphertext) >= 20000000 then
    raise exception 'budget too large';
  end if;
  update shared_budgets
     set ciphertext = p_ciphertext, key_version = p_key_version, version = version + 1, updated_by = auth.uid(), updated_at = now()
   where id = p_id and version = p_expected and (p_key_version = key_version or owner_id = auth.uid())
   returning version into new_version;
  if new_version is null then
    raise exception 'version conflict' using hint = 'conflict';
  end if;
  return new_version;
end $$;

-- Lets a signed-in user find someone to invite (returns only their public key and name).
create or replace function public.find_profile_by_email(p_email text)
returns table (id uuid, public_key text, display_name text)
language sql stable security definer set search_path = public as $$
  select p.id, p.public_key, p.display_name from profiles p
   where auth.uid() is not null and lower(p.email) = lower(trim(p_email)) limit 1;
$$;

create or replace function public.list_members(p_budget uuid)
returns table (user_id uuid, role text, email text, display_name text, public_key text, key_version int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_budget_member(p_budget) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  return query
    select m.user_id, m.role, p.email, p.display_name, p.public_key, m.key_version
      from budget_members m join profiles p on p.id = m.user_id
     where m.budget_id = p_budget
     order by m.created_at;
end $$;

revoke all on function public.push_budget(uuid, bigint, text, int) from public, anon;
revoke all on function public.find_profile_by_email(text) from public, anon;
revoke all on function public.list_members(uuid) from public, anon;
grant execute on function public.push_budget(uuid, bigint, text, int) to authenticated;
grant execute on function public.find_profile_by_email(text) to authenticated;
grant execute on function public.list_members(uuid) to authenticated;

-- ---------- Realtime (live updates between members; RLS still applies) ----------
do $$ begin
  alter publication supabase_realtime add table public.shared_budgets, public.budget_members;
exception when duplicate_object then null; end $$;

-- ---------- Account deletion (also in 002_account_deletion.sql) ----------
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
