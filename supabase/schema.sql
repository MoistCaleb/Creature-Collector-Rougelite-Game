-- Hexbound accounts: run this once in Supabase › SQL Editor › New query.
-- Each player's save is one row, readable and writable only by them (row-level security).

create table if not exists public.saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- The save as the game stores it (JSON text): progress, and the run in progress if any.
  meta text,
  run text,
  saved_at timestamptz not null default now()
);

alter table public.saves enable row level security;

drop policy if exists "Players read their own save" on public.saves;
create policy "Players read their own save" on public.saves
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Players create their own save" on public.saves;
create policy "Players create their own save" on public.saves
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Players update their own save" on public.saves;
create policy "Players update their own save" on public.saves
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Players delete their own save" on public.saves;
create policy "Players delete their own save" on public.saves
  for delete to authenticated using (auth.uid() = user_id);

-- "Delete my account" in the game: removes the player's login (and, through the cascade, their save).
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = public
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
