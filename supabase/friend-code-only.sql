-- Hexbound: friends are added by friend code only (usernames show on the leaderboards, so they
-- aren't enough to send a request). Run once in Supabase › SQL Editor › New query.
-- (friends.sql has the same change, for new projects.)

create or replace function public.find_player(q text)
returns table (user_id uuid, username text, friend_code text, look jsonb, title text)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.username, p.friend_code, p.look, p.title
  from profiles p
  where p.friend_code = upper(trim(q))
    and p.user_id <> auth.uid()
    and not is_blocked(auth.uid(), p.user_id)
  limit 1;
$$;

revoke all on function public.find_player(text) from public, anon;
grant execute on function public.find_player(text) to authenticated;
