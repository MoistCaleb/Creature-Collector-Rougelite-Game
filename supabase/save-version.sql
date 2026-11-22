-- Hexbound save versions: run this once in Supabase › SQL Editor › New query (after schema.sql).
-- Each save remembers which version of the game wrote it, and an older version of the game (an
-- app that hasn't updated yet) can't overwrite a save from a newer one. Games from before this
-- send no version at all, so they're stopped too once a newer game has saved.
-- Running it again is safe.

alter table public.saves add column if not exists game_version int;

create or replace function public.saves_keep_newer() returns trigger
language plpgsql as $$
begin
  if old.game_version is not null and coalesce(new.game_version, 0) < old.game_version then
    raise exception 'This account has a save from a newer version of Hexbound. Update the game to keep syncing.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists saves_keep_newer on public.saves;
create trigger saves_keep_newer before update on public.saves
  for each row execute function public.saves_keep_newer();
