-- A second copy of each person's encryption key backup, locked with a recovery code they save when setting their
-- password (instead of the password). It opens their budgets if they forget the password. Like the main backup,
-- the server can't read it. Run once in the SQL editor, after schema.sql.

alter table public.profiles add column if not exists recovery_private_key text check (char_length(recovery_private_key) < 1000);
alter table public.profiles add column if not exists recovery_kdf jsonb;
