import { cleanLook, type TrainerLook } from '../data/trainerLook';
import { myScores } from '../logic/leaderboard';
import type { Meta } from '../logic/run';
import { accountClient, currentUser } from './account';
import { myProfile } from './friends';

/** Top 10 leaderboards on the server (see supabase/leaderboard.sql). */

export interface BoardRow {
  place: number;
  username: string;
  look: TrainerLook;
  title: string | null;
  value: number;
  me: boolean;
}

function err(e: { message?: string } | null | undefined, fallback: string): Error {
  const m = e?.message ?? fallback;
  if (/fetch|network|Failed to/i.test(m)) return new Error('Couldn’t reach the server. Check your connection.');
  if (/does not exist|schema cache|column/i.test(m)) return new Error('Leaderboards aren’t set up on the server yet.');
  return new Error(m);
}

let lastSent = '';

/** Send your numbers if they changed since last time (the server keeps your best ever). */
export async function postMyScores(meta: Meta, force = false) {
  if (!currentUser() || !myProfile()) return;
  const s = myScores(meta);
  const key = JSON.stringify(s);
  if (!force && key === lastSent) return;
  const { error } = await accountClient().rpc('post_scores', { s });
  if (!error) lastSent = key;
}

export async function fetchBoard(stat: string, friendsOnly: boolean): Promise<BoardRow[]> {
  const { data, error } = await accountClient().rpc('leaderboard', { stat, friends_only: friendsOnly });
  if (error) throw err(error, 'Couldn’t load the leaderboard.');
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    place: Number(r.place),
    username: String(r.username),
    look: cleanLook(r.look),
    title: typeof r.title === 'string' ? r.title : null,
    value: Number(r.value),
    me: !!r.me,
  }));
}

/** Whether you're shown on the boards (on unless you hid yourself). */
export async function onLeaderboard(): Promise<boolean> {
  const u = currentUser();
  if (!u) return false;
  const { data, error } = await accountClient().from('profiles').select('on_leaderboard').eq('user_id', u.id).maybeSingle();
  if (error) throw err(error, 'Couldn’t load your settings.');
  return data?.on_leaderboard !== false;
}

export async function setOnLeaderboard(on: boolean) {
  const u = currentUser();
  if (!u) return;
  const { error } = await accountClient().from('profiles').update({ on_leaderboard: on }).eq('user_id', u.id);
  if (error) throw err(error, 'Couldn’t change that.');
}
