import type { RealtimeChannel } from '@supabase/supabase-js';
import { cleanLook, cleanName, nameProblem, type TrainerLook } from '../data/trainerLook';
import { accountClient, accountsAvailable, currentUser } from './account';
import { GAME_MODES, type GameMode } from './duel';
import { setGhostPool, type GhostMember } from '../logic/surprises';

/**
 * Friends: a username and friend code each (you add people by code), friend requests, who's online (and what they're up
 * to), and invites into your online lobby. All of it goes through the account (see
 * supabase/friends.sql for the rules the server enforces).
 */

export interface Profile {
  userId: string;
  username: string;
  friendCode: string;
}

export interface Friend {
  userId: string;
  username: string;
  friendCode: string;
  look: TrainerLook;
  title: string | null;
  /** Their favourite Hexling (or last starter), to sit by your campfire. */
  buddy: Buddy | null;
  /** Their last winning team, for a friend's ghost (accepted friends only; needs ghost.sql). */
  ghost: GhostMember[] | null;
  status: 'pending' | 'accepted';
  /** A request they sent you (pending only). */
  incoming: boolean;
  online: boolean;
  activity: string | null;
}

export interface Buddy {
  id: string;
  stage: number;
  shiny: boolean;
}

function cleanBuddy(x: unknown): Buddy | null {
  const b = (x && typeof x === 'object' ? x : null) as Record<string, unknown> | null;
  if (!b || typeof b.id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(b.id)) return null;
  const stage = Number(b.stage);
  return { id: b.id, stage: Number.isInteger(stage) && stage >= 0 && stage <= 2 ? stage : 0, shiny: b.shiny === true };
}

/** A ghost team from the server: up to 4 real-looking members, or null. */
export function cleanGhost(x: unknown): GhostMember[] | null {
  if (!Array.isArray(x)) return null;
  const team = x
    .slice(0, 4)
    .map((m) => (m && typeof m === 'object' ? (m as Record<string, unknown>) : null))
    .filter((m): m is Record<string, unknown> => !!m && typeof m.speciesId === 'string' && /^[a-z0-9_-]{1,40}$/.test(m.speciesId))
    .map((m) => {
      const stage = Number(m.stage);
      const level = Number(m.level);
      return {
        speciesId: m.speciesId as string,
        stage: Number.isInteger(stage) && stage >= 0 && stage <= 2 ? stage : 0,
        level: Number.isFinite(level) ? Math.max(1, Math.min(100, Math.round(level))) : 1,
      };
    });
  return team.length ? team : null;
}

/** Your last winning team, for your friends' ghost encounters (quietly skipped before ghost.sql is run). */
export async function shareGhost(team: GhostMember[] | null) {
  const u = currentUser();
  if (!u || !profile || !team?.length) return;
  const ghost = team.slice(0, 4).map((m) => ({ speciesId: m.speciesId, stage: m.stage, level: m.level }));
  await accountClient().from('profiles').update({ ghost }).eq('user_id', u.id);
}

export interface Invite {
  id: number;
  fromUser: string;
  username: string;
  look: TrainerLook;
  mode: GameMode;
  code: string;
  at: number;
}

/** Checked in within this long: online. */
const ONLINE_MS = 2.5 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

let profile: Profile | null = null;
export const myProfile = (): Profile | null => profile;

/** Signed in (friends need an account). */
export const friendsAvailable = (): boolean => accountsAvailable() && !!currentUser();

function err(e: { message?: string } | null | undefined, fallback: string): Error {
  const m = e?.message ?? fallback;
  if (/fetch|network|Failed to/i.test(m)) return new Error('Couldn’t reach the server. Check your connection.');
  if (/relation .* does not exist|function .* does not exist|schema cache/i.test(m)) return new Error('Friends aren’t set up on the server yet.');
  return new Error(m);
}

export async function loadProfile(): Promise<Profile | null> {
  const u = currentUser();
  if (!u) return (profile = null);
  const { data, error } = await accountClient().from('profiles').select('user_id, username, friend_code').eq('user_id', u.id).maybeSingle();
  if (error) throw err(error, 'Couldn’t load your profile.');
  profile = data ? { userId: data.user_id, username: data.username, friendCode: data.friend_code } : null;
  return profile;
}

/** Your username is your trainer name: the same rules (see nameProblem). */
export const usernameProblem = (name: string): string | null => nameProblem(name);

export async function claimUsername(name: string): Promise<Profile> {
  const problem = usernameProblem(name);
  if (problem) throw new Error(problem);
  const { data, error } = await accountClient().rpc('claim_username', { name: cleanName(name) });
  if (error) throw err(error, 'Couldn’t save that username.');
  const row = Array.isArray(data) ? data[0] : data;
  profile = { userId: row.user_id, username: row.username, friendCode: row.friend_code };
  return profile;
}

/** What friends see of you: your trainer and title (and the Hexling by your side at their camp). */
export async function shareLook(look: TrainerLook, title: string | null, buddy?: Buddy | null) {
  const u = currentUser();
  if (!u || !profile) return;
  const { error } = await accountClient().from('profiles').update({ look, title, ...(buddy ? { buddy } : {}) }).eq('user_id', u.id);
  // Before camp.sql has been run there's no buddy column: share the rest.
  if (error && buddy) await accountClient().from('profiles').update({ look, title }).eq('user_id', u.id);
}

// ---------------------------------------------------------------- the list

export async function listFriends(): Promise<Friend[]> {
  const { data, error } = await accountClient().rpc('my_friends');
  if (error) throw err(error, 'Couldn’t load your friends.');
  const now = Date.now();
  const list = ((data ?? []) as Record<string, unknown>[])
    .map((r) => {
      const seen = r.last_seen ? Date.parse(String(r.last_seen)) : 0;
      return {
        userId: String(r.user_id),
        username: String(r.username),
        friendCode: String(r.friend_code),
        look: cleanLook(r.look),
        title: typeof r.title === 'string' ? r.title : null,
        buddy: cleanBuddy(r.buddy),
        ghost: r.status === 'accepted' ? cleanGhost(r.ghost) : null,
        status: r.status === 'accepted' ? 'accepted' : 'pending',
        incoming: !!r.incoming,
        online: r.status === 'accepted' && now - seen < ONLINE_MS,
        activity: typeof r.activity === 'string' ? r.activity : null,
      } satisfies Friend;
    })
    .sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
  // Friends' ghosts can turn up on your runs (online or not).
  setGhostPool(list.filter((f) => f.status === 'accepted' && f.ghost).map((f) => ({ name: f.username, look: f.look, team: f.ghost! })));
  return list;
}

/** A friend code however it was typed ("hex 4k9p2", "4K9P2") as HEX-4K9P2, or null if it can't be one. */
export function normalizeCode(q: string): string | null {
  const raw = q.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = raw.startsWith('HEX') && raw.length === 8 ? raw.slice(3) : raw;
  return /^[A-Z0-9]{5}$/.test(body) ? `HEX-${body}` : null;
}

/** Find a player by friend code (the only way to add someone). */
export async function findPlayer(q: string): Promise<{ userId: string; username: string; look: TrainerLook; title: string | null } | null> {
  const { data, error } = await accountClient().rpc('find_player', { q: normalizeCode(q) ?? q.trim() });
  if (error) throw err(error, 'Couldn’t search.');
  const r = (data as Record<string, unknown>[] | null)?.[0];
  return r ? { userId: String(r.user_id), username: String(r.username), look: cleanLook(r.look), title: typeof r.title === 'string' ? r.title : null } : null;
}

/** 'sent', or 'friends' when they had already asked you. */
export async function sendRequest(userId: string): Promise<'sent' | 'friends'> {
  const { data, error } = await accountClient().rpc('send_friend_request', { target: userId });
  if (error) throw err(error, 'Couldn’t send the request.');
  return data === 'friends' ? 'friends' : 'sent';
}

export async function respond(userId: string, accept: boolean) {
  const { error } = await accountClient().rpc('respond_friend_request', { other: userId, accept });
  if (error) throw err(error, 'Couldn’t answer the request.');
}

export async function removeFriend(userId: string) {
  const { error } = await accountClient().rpc('remove_friend', { other: userId });
  if (error) throw err(error, 'Couldn’t remove them.');
}

export async function blockPlayer(userId: string) {
  const { error } = await accountClient().rpc('block_player', { other: userId });
  if (error) throw err(error, 'Couldn’t block them.');
}

// ---------------------------------------------------------------- online

let heartbeat: ReturnType<typeof setInterval> | null = null;
let activity: () => string = () => 'Online';

/** While the game is open (and in front), check in now and then so friends see you online. */
export function startPresence(whatImDoing: () => string) {
  activity = whatImDoing;
  if (heartbeat) return;
  const beat = () => {
    const u = currentUser();
    if (!u || !profile || document.visibilityState !== 'visible') return;
    void checkIn(u.id);
  };
  heartbeat = setInterval(beat, HEARTBEAT_MS);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && beat());
  beat();
}

/** Check in right away (e.g. after starting a lobby, so the activity is fresh). */
export function pingPresence() {
  const u = currentUser();
  if (!u || !profile) return;
  void checkIn(u.id);
}

async function checkIn(uid: string) {
  const { error } = await accountClient().from('profiles').update({ last_seen: new Date().toISOString(), activity: activity().slice(0, 40) }).eq('user_id', uid);
  if (error) console.warn('Couldn’t check in as online', error.message);
}

// ---------------------------------------------------------------- invites

export async function sendInvite(userId: string, mode: GameMode, code: string) {
  const { error } = await accountClient().rpc('send_invite', { target: userId, game_mode: mode, lobby_code: code });
  if (error) throw err(error, 'Couldn’t send the invite.');
}

export async function dismissInvite(id: number) {
  await accountClient().from('invites').delete().eq('id', id);
}

const seen = new Set<number>();
let channel: RealtimeChannel | null = null;
let poll: ReturnType<typeof setInterval> | null = null;

function toInvite(r: Record<string, unknown>): Invite | null {
  const mode = String(r.mode) as GameMode;
  if (!(mode in GAME_MODES)) return null;
  return {
    id: Number(r.id),
    fromUser: String(r.from_user),
    username: String(r.username ?? 'A friend'),
    look: cleanLook(r.look),
    mode,
    code: String(r.code),
    at: Date.parse(String(r.created_at)) || Date.now(),
  };
}

/**
 * Hear about invites: straight away through the live connection, and by checking every 20
 * seconds in case it dropped. Each invite is reported once.
 */
export function listenForInvites(onInvite: (i: Invite) => void) {
  const u = currentUser();
  if (!u || channel) return;
  const check = async () => {
    if (!currentUser() || document.visibilityState !== 'visible') return;
    const { data } = await accountClient().rpc('my_invites');
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const inv = toInvite(r);
      if (inv && !seen.has(inv.id)) {
        seen.add(inv.id);
        onInvite(inv);
      }
    }
  };
  channel = accountClient()
    .channel(`invites:${u.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'invites', filter: `to_user=eq.${u.id}` }, () => void check())
    .subscribe();
  poll = setInterval(() => void check(), 20000);
  void check();
}

export function stopListening() {
  if (channel) void accountClient().removeChannel(channel);
  channel = null;
  if (poll) clearInterval(poll);
  poll = null;
}

/** "Online · In a run", "Online", or "Offline". */
export function statusLine(f: Friend): string {
  if (f.status === 'pending') return f.incoming ? 'Wants to be friends' : 'Request sent';
  return f.online ? `Online${f.activity && f.activity !== 'Online' ? ` · ${f.activity}` : ''}` : 'Offline';
}
