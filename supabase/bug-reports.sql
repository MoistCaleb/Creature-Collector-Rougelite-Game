-- Hexbound: bug reports (Settings › Report a bug).
-- Anyone playing can send a report. Nobody can read, change or delete them from the game: only a
-- request that carries the private bug-report key (the x-bug-token header) can, which is how
-- Claude lists the reports and deletes the ones that are fixed.
--
-- Run once in Supabase › SQL Editor › New query. The last statement shows the private key: save it
-- in Claude Code's credential form when asked (never paste it into a chat).

create extension if not exists pgcrypto;

create table if not exists public.bug_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  place text not null check (char_length(place) between 1 and 40),
  description text not null check (char_length(description) between 1 and 2000),
  -- Version, screen, run, device and recent errors, collected by the game.
  context jsonb not null default '{}'::jsonb check (pg_column_size(context) < 8000),
  user_id uuid default auth.uid(),
  username text check (username is null or char_length(username) <= 40)
);

alter table public.bug_reports enable row level security;

-- The private key, in a table nobody can read through the API.
create table if not exists public.bug_admin (token text primary key);
alter table public.bug_admin enable row level security;
revoke all on public.bug_admin from public, anon, authenticated;
insert into public.bug_admin (token)
select encode(gen_random_bytes(24), 'hex')
where not exists (select 1 from public.bug_admin);

-- True when this request carries the private key.
create or replace function public.is_bug_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bug_admin
    where token = coalesce(current_setting('request.headers', true)::json ->> 'x-bug-token', '')
  );
$$;
revoke all on function public.is_bug_admin() from public;
grant execute on function public.is_bug_admin() to anon, authenticated;

drop policy if exists "anyone can send a bug report" on public.bug_reports;
create policy "anyone can send a bug report" on public.bug_reports
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists "only the key reads reports" on public.bug_reports;
create policy "only the key reads reports" on public.bug_reports
  for select to anon, authenticated using (public.is_bug_admin());

drop policy if exists "only the key deletes reports" on public.bug_reports;
create policy "only the key deletes reports" on public.bug_reports
  for delete to anon, authenticated using (public.is_bug_admin());

grant insert (place, description, context, user_id, username) on public.bug_reports to anon, authenticated;
grant select, delete on public.bug_reports to anon, authenticated;

-- Your private bug-report key (copy it for the credential form):
select token as bug_report_key from public.bug_admin;
