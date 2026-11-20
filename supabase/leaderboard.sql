-- Hexbound leaderboards: run this once in Supabase › SQL Editor › New query (after friends.sql).
-- All-time Top 10s. Each player's best ever number on each board is kept on their profile; the
-- game sends its numbers and the server only ever raises them (within sensible limits).
-- Running it again is safe (it updates an older project).

alter table public.profiles add column if not exists scores jsonb not null default '{}';
-- When each best was reached: on a tie, whoever got there first ranks higher.
alter table public.profiles add column if not exists scores_at jsonb not null default '{}';
-- Players can hide themselves from the boards.
alter table public.profiles add column if not exists on_leaderboard boolean not null default true;

-- Scores only change through post_scores(); showing or hiding yourself is yours to change.
grant update (on_leaderboard) on public.profiles to authenticated;

-- The boards and the most anyone could honestly have on each.
create or replace function public.leaderboard_caps() returns jsonb
language sql immutable as $$
  select '{
    "wins": 100000, "streak": 100000, "heat": 20, "dex": 2000, "caught": 10000000,
    "battles": 10000000, "guardians": 1000000, "gilded": 1000000, "legends": 100,
    "hunt": 100000, "tourney": 100000, "online": 1000000, "titles": 1000, "coins": 2000000000,
    "fastest": 86400
  }'::jsonb;
$$;

-- Boards where lower is better (a time, in seconds).
create or replace function public.leaderboard_low(stat text) returns boolean
language sql immutable as $$ select stat in ('fastest') $$;

-- Send your numbers: any that beat your best become your new best.
create or replace function public.post_scores(s jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  caps jsonb := leaderboard_caps();
  cur jsonb;
  at jsonb;
  k text;
  v bigint;
begin
  if me is null or jsonb_typeof(s) <> 'object' then return; end if;
  select scores, scores_at into cur, at from profiles where user_id = me for update;
  if not found then return; end if;
  for k in select jsonb_object_keys(caps) loop
    if jsonb_typeof(s -> k) = 'number' then
      v := least(greatest(floor((s ->> k)::numeric), 0), (caps ->> k)::numeric)::bigint;
      -- A time: lower is better (and under a minute isn't a real run).
      if leaderboard_low(k) then
        if v >= 60 and (cur ->> k is null or v < (cur ->> k)::bigint) then
          cur := cur || jsonb_build_object(k, v);
          at := at || jsonb_build_object(k, now());
        end if;
      elsif v > coalesce((cur ->> k)::bigint, 0) then
        cur := cur || jsonb_build_object(k, v);
        at := at || jsonb_build_object(k, now());
      end if;
    end if;
  end loop;
  update profiles set scores = cur, scores_at = at where user_id = me;
end $$;

-- One board's Top 10 (everyone, or just you and your friends), plus your own place if you're
-- further down. Players who hid themselves, and anyone blocked either way, aren't shown.
create or replace function public.leaderboard(stat text, friends_only boolean default false)
returns table (place bigint, username text, look jsonb, title text, value bigint, me boolean)
language sql stable security definer set search_path = public as $$
  with board as (
    select p.user_id, p.username, p.look, p.title, (p.scores ->> stat)::bigint as value,
      row_number() over (
        order by (case when leaderboard_low(stat) then 1 else -1 end) * (p.scores ->> stat)::bigint asc,
          (p.scores_at ->> stat)::timestamptz asc nulls last, p.created_at
      ) as place
    from profiles p
    where leaderboard_caps() ? stat
      and coalesce((p.scores ->> stat)::bigint, 0) > 0
      and p.on_leaderboard
      and (not friends_only or p.user_id = auth.uid() or are_friends(auth.uid(), p.user_id))
      and not is_blocked(auth.uid(), p.user_id)
  )
  select place, username, look, title, value, user_id = auth.uid()
  from board
  where place <= 10 or user_id = auth.uid()
  order by place;
$$;

-- Only signed-in players may call these.
revoke all on function public.post_scores(jsonb) from public, anon;
grant execute on function public.post_scores(jsonb) to authenticated;
revoke all on function public.leaderboard(text, boolean) from public, anon;
grant execute on function public.leaderboard(text, boolean) to authenticated;
