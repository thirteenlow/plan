-- Plan: richer screenshot scans. Run once in the Supabase SQL editor (after 003_payment_inbox.sql).
-- Scans from the iPhone shortcut now also carry a suggested category, the payment date and where they came from.
-- Like the rest of the inbox these are short, unencrypted and deleted as soon as the app imports them.

alter table public.payment_inbox add column if not exists category text check (char_length(category) <= 60);
alter table public.payment_inbox add column if not exists paid_on date;
alter table public.payment_inbox add column if not exists source text check (char_length(source) <= 20);
