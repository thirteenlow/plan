-- Plan: screenshot capture (reads a payment screenshot with Claude and logs it to the inbox).
-- Run once in the Supabase SQL editor (after 003_payment_inbox.sql).
--
-- The scan-payment Edge Function calls begin_scan() with the user's inbox key before it spends anything on
-- Claude: it checks the key, the waiting-inbox cap and a daily scan limit, then returns the user's id.
-- Only the function (service role) can call it; screenshots themselves are never stored.

create table if not exists public.scan_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  scans int not null default 0,
  primary key (user_id, day)
);
alter table public.scan_usage enable row level security;
-- No policies: only begin_scan() touches this table.

create or replace function public.begin_scan(token text, daily_limit int default 30) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid;
  used int;
begin
  if token is null or char_length(token) < 20 or char_length(token) > 200 then
    raise exception 'invalid key' using errcode = '28000';
  end if;
  select k.user_id into uid from inbox_keys k where k.key_hash = encode(digest(token, 'sha256'), 'hex');
  if uid is null then
    raise exception 'invalid key' using errcode = '28000';
  end if;
  if (select count(*) from payment_inbox where user_id = uid) >= 500 then
    raise exception 'inbox is full; open Plan to import' using errcode = '54000';
  end if;
  insert into scan_usage (user_id, day, scans) values (uid, current_date, 1)
  on conflict (user_id, day) do update set scans = scan_usage.scans + 1
  returning scans into used;
  if used > daily_limit then
    raise exception 'daily scan limit reached' using errcode = '54000';
  end if;
  delete from scan_usage where user_id = uid and day < current_date - 90;
  return uid;
end $$;

revoke all on function public.begin_scan(text, int) from public, anon, authenticated;
grant execute on function public.begin_scan(text, int) to service_role;

-- Real token counts per user per day, as reported by Claude for each scan (see record_scan_tokens).
alter table public.scan_usage add column if not exists input_tokens bigint not null default 0;
alter table public.scan_usage add column if not exists output_tokens bigint not null default 0;

create or replace function public.record_scan_tokens(p_user uuid, p_input int, p_output int) returns void
language sql security definer set search_path = public as $$
  insert into scan_usage (user_id, day, input_tokens, output_tokens) values (p_user, current_date, greatest(p_input, 0), greatest(p_output, 0))
  on conflict (user_id, day) do update
    set input_tokens = scan_usage.input_tokens + excluded.input_tokens, output_tokens = scan_usage.output_tokens + excluded.output_tokens;
$$;

revoke all on function public.record_scan_tokens(uuid, int, int) from public, anon, authenticated;
grant execute on function public.record_scan_tokens(uuid, int, int) to service_role;

-- Totals so far:  select day, sum(scans) scans, sum(input_tokens) input, sum(output_tokens) output from scan_usage group by day order by day desc;
