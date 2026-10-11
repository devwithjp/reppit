-- reppit on Supabase: lock the public schema down to server-side access only.
--
-- The app reads and writes through its own database role (the connection in DATABASE_URL, which owns
-- these tables), never through Supabase's PostgREST / supabase-js with the anon or authenticated keys.
-- Enabling RLS with NO policies means anon and authenticated can read and write nothing, so the
-- auto-generated public API exposes nothing even though it exists.
--
-- Table owners bypass RLS unless FORCE ROW LEVEL SECURITY is set, which is why this file deliberately
-- does not FORCE: the app's own role must keep working. Do not connect the app as anon/authenticated.
--
-- Run order on a fresh project:
--   1. this file's extension statement (or let createDb run CREATE EXTENSION itself),
--   2. migrations (apps/web/scripts/migrate.ts),
--   3. this file again (idempotent), so RLS covers every table the migrations created.
-- Re-run after any migration that adds a table. The DO block at the end catches tables not listed.

create extension if not exists vector;

alter table public.users                enable row level security;
alter table public.items                enable row level security;
alter table public.item_aliases         enable row level security;
alter table public.votes                enable row level security;
alter table public.comments             enable row level security;
alter table public.tags                 enable row level security;
alter table public.item_tags            enable row level security;
alter table public.agent_compat_reports enable row level security;
alter table public.featured_listings    enable row level security;
alter table public.api_keys             enable row level security;
alter table public.search_log           enable row level security;

-- Safety net: any other table in public (added by a later migration and not listed above).
do $$
declare t record;
begin
  for t in select schemaname, tablename from pg_tables where schemaname = 'public' and not rowsecurity loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
    raise notice 'enabled RLS on unlisted table %.%', t.schemaname, t.tablename;
  end loop;
end $$;

-- Belt and braces: no table privileges for the API roles either, so a policy added by mistake later
-- still cannot expose data on its own. Guarded so the file also runs on plain Postgres without these roles.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
    execute 'revoke all on all sequences in schema public from anon';
    execute 'alter default privileges in schema public revoke all on tables from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
    execute 'alter default privileges in schema public revoke all on tables from authenticated';
  end if;
end $$;

-- Verify: every public table has RLS on and no policies exist.
--   select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
--   select * from pg_policies where schemaname = 'public';   -- expect zero rows
