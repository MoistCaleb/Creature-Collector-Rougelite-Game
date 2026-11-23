-- Hexbound friends: run this once in Supabase › SQL Editor › New query (after schema.sql).
-- Usernames and friend codes, friend requests, blocking, who's online, and lobby invites.
--
-- Privacy: you can only add someone by their friend code (usernames show on the leaderboards, so
-- they aren't enough to send a request), and you only ever see the profiles of your friends (and of people with a request
-- open between you). Everything goes through the functions below, which check who is asking.

-- ---------------------------------------------------------------- profiles

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Your username is your trainer name (3-16 letters, numbers, spaces, _ - or .).
  username text not null,
  friend_code text not null unique,
  -- What friends see: your trainer's look and title.
  look jsonb,
  title text,
  -- The Hexling that sits with you by friends' campfires: { id, stage, shiny }.
  buddy jsonb,
  ghost jsonb,
  -- "Online now": the game checks in every minute or so while it's open.
  last_seen timestamptz,
  activity text,
  created_at timestamptz not null default now()
);
-- (Re)set the username rule, so running this file again updates an older project too.
alter table public.profiles drop constraint if exists profiles_username_check;
alter table public.profiles add constraint profiles_username_check
  check (username ~ '^[A-Za-z0-9][A-Za-z0-9 _.-]{1,14}[A-Za-z0-9]$' and username !~ '  ');

-- Usernames are unique whatever the capitals (Sam and sam are the same name).
create unique index if not exists profiles_username_lower on public.profiles (lower(username));
alter table public.profiles enable row level security;

drop policy if exists "Players read their own profile" on public.profiles;
create policy "Players read their own profile" on public.profiles
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "Players update their own profile" on public.profiles;
create policy "Players update their own profile" on public.profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- The username and friend code only change through claim_username().
alter table public.profiles add column if not exists buddy jsonb;
alter table public.profiles add column if not exists ghost jsonb;
grant update (look, title, buddy, ghost, last_seen, activity) on public.profiles to authenticated;

-- ---------------------------------------------------------------- friendships and blocks

create table if not exists public.friendships (
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
alter table public.friendships enable row level security;
drop policy if exists "Players see their own friendships" on public.friendships;
create policy "Players see their own friendships" on public.friendships
  for select to authenticated using (auth.uid() in (requester, addressee));
revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;

create table if not exists public.blocks (
  blocker uuid not null references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  primary key (blocker, blocked)
);
alter table public.blocks enable row level security;
drop policy if exists "Players see who they blocked" on public.blocks;
create policy "Players see who they blocked" on public.blocks
  for select to authenticated using (blocker = auth.uid());
revoke all on public.blocks from anon, authenticated;
grant select on public.blocks to authenticated;

-- ---------------------------------------------------------------- invites

create table if not exists public.invites (
  id bigint generated always as identity primary key,
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('duel', 'stage', 'royale', 'tourney')),
  code text not null check (code ~ '^[A-Z0-9]{3,10}$'),
  created_at timestamptz not null default now()
);
alter table public.invites enable row level security;
drop policy if exists "Players see invites to and from them" on public.invites;
create policy "Players see invites to and from them" on public.invites
  for select to authenticated using (auth.uid() in (from_user, to_user));
drop policy if exists "Players clear invites to and from them" on public.invites;
create policy "Players clear invites to and from them" on public.invites
  for delete to authenticated using (auth.uid() in (from_user, to_user));
revoke all on public.invites from anon, authenticated;
grant select, delete on public.invites to authenticated;

-- Invites arrive the moment they're sent.
do $$
begin
  alter publication supabase_realtime add table public.invites;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------- helpers

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from friendships
    where status = 'accepted' and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

create or replace function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;

-- ---------------------------------------------------------------- what the game calls

-- Pick (or change) your username, which is your trainer name. You get a friend code the first time.
create or replace function public.claim_username(name text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  result profiles;
  code text;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  name := regexp_replace(trim(name), '\s+', ' ', 'g');
  if name !~ '^[A-Za-z0-9][A-Za-z0-9 _.-]{1,14}[A-Za-z0-9]$' then
    raise exception 'Names are 3 to 16 letters, numbers, spaces, _ - or ., starting and ending with a letter or number.';
  end if;
  if lower(regexp_replace(name, '[ _.-]', '', 'g')) ~ '(fuck|shit|cunt|nigg|fag|bitch|whore|slut|rape|nazi|hitler|porn|sex|dick|cock|pussy|penis|vagina|kys)' then
    raise exception 'Please pick a different name.';
  end if;
  if exists (select 1 from profiles where lower(username) = lower(name) and user_id <> me) then
    raise exception 'Someone already has that name. Try another.';
  end if;
  if exists (select 1 from profiles where user_id = me) then
    update profiles set username = name where user_id = me returning * into result;
    return result;
  end if;
  -- HEX- and 5 letters or digits that can't be mixed up (no 0/O or 1/I).
  loop
    code := 'HEX-';
    for i in 1..5 loop
      code := code || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from profiles where friend_code = code);
  end loop;
  insert into profiles (user_id, username, friend_code) values (me, name, code) returning * into result;
  return result;
end $$;

-- Find one player by their friend code (never yourself, never someone who blocked you).
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

-- Send a request (or accept theirs, if they already asked you).
create or replace function public.send_friend_request(target uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or target is null or target = me then raise exception 'You can''t add that player.'; end if;
  if is_blocked(me, target) then raise exception 'You can''t add that player.'; end if;
  if not exists (select 1 from profiles where user_id = me) then raise exception 'Pick a username first.'; end if;
  if are_friends(me, target) then return 'friends'; end if;
  if exists (select 1 from friendships where requester = target and addressee = me) then
    update friendships set status = 'accepted' where requester = target and addressee = me;
    return 'friends';
  end if;
  insert into friendships (requester, addressee) values (me, target) on conflict do nothing;
  return 'sent';
end $$;

create or replace function public.respond_friend_request(other uuid, accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if accept then
    update friendships set status = 'accepted' where requester = other and addressee = auth.uid();
  else
    delete from friendships where requester = other and addressee = auth.uid();
  end if;
end $$;

-- Remove a friend, cancel a request you sent, or decline one you got.
create or replace function public.remove_friend(other uuid) returns void
language sql security definer set search_path = public as $$
  delete from friendships where (requester = auth.uid() and addressee = other) or (requester = other and addressee = auth.uid());
$$;

create or replace function public.block_player(other uuid) returns void
language sql security definer set search_path = public as $$
  delete from friendships where (requester = auth.uid() and addressee = other) or (requester = other and addressee = auth.uid());
  delete from invites where (from_user = other and to_user = auth.uid()) or (from_user = auth.uid() and to_user = other);
  insert into blocks (blocker, blocked) values (auth.uid(), other) on conflict do nothing;
$$;

create or replace function public.unblock_player(other uuid) returns void
language sql security definer set search_path = public as $$
  delete from blocks where blocker = auth.uid() and blocked = other;
$$;

-- Your friends and open requests, with what friends can see of each other.
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

-- Invite a friend to your lobby (replaces an older invite to them).
create or replace function public.send_invite(target uuid, game_mode text, lobby_code text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not are_friends(me, target) then raise exception 'You can only invite friends.'; end if;
  delete from invites where created_at < now() - interval '1 hour';
  delete from invites where from_user = me and to_user = target;
  insert into invites (from_user, to_user, mode, code) values (me, target, game_mode, upper(lobby_code));
end $$;

-- Invites waiting for you (from the last 10 minutes), with who sent them.
create or replace function public.my_invites()
returns table (id bigint, from_user uuid, username text, look jsonb, mode text, code text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.from_user, p.username, p.look, i.mode, i.code, i.created_at
  from invites i join profiles p on p.user_id = i.from_user
  where i.to_user = auth.uid() and i.created_at > now() - interval '10 minutes'
    and are_friends(i.from_user, auth.uid())
  order by i.created_at desc;
$$;

-- The two checks are only for the functions here, not to be called directly.
revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_blocked(uuid, uuid) from public, anon, authenticated;

-- Only signed-in players may call these.
do $$
declare f text;
begin
  foreach f in array array[
    'claim_username(text)', 'find_player(text)',
    'send_friend_request(uuid)', 'respond_friend_request(uuid, boolean)', 'remove_friend(uuid)',
    'block_player(uuid)', 'unblock_player(uuid)', 'my_friends()', 'send_invite(uuid, text, text)', 'my_invites()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
