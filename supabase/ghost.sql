-- Hexbound 2.0: a friend's ghost (a rare surprise). Each player's last winning team is saved on their
-- profile, and only their accepted friends can read it (through my_friends, like buddy and look).
-- Run once in Supabase › SQL Editor › New query (friends.sql has the same change, for new projects).

alter table public.profiles add column if not exists ghost jsonb;
grant update (ghost) on public.profiles to authenticated;

drop function if exists public.my_friends();
create or replace function public.my_friends()
returns table (user_id uuid, username text, friend_code text, look jsonb, title text, buddy jsonb, ghost jsonb, last_seen timestamptz, activity text, status text, incoming boolean)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.username, p.friend_code, p.look, p.title, p.buddy,
         case when f.status = 'accepted' then p.ghost end,
         case when f.status = 'accepted' then p.last_seen end,
         case when f.status = 'accepted' then p.activity end,
         f.status, f.addressee = auth.uid()
  from friendships f
  join profiles p on p.user_id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee);
$$;

revoke all on function public.my_friends() from public, anon;
grant execute on function public.my_friends() to authenticated;
