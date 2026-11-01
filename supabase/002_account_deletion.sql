-- Plan: lets a signed-in user delete their own account (required by Google Play for apps with sign-in).
-- Run in the Supabase SQL editor if you already ran schema.sql before this file existed.
-- Deleting the auth user cascades to their profile, budgets they own (for everyone) and their memberships.

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
