import { formatDuration } from './runClock';
import { earnedTitles } from './titles';
import { legendsCaught, type Meta } from './run';

/**
 * All-time Top 10 leaderboards: what's ranked, and your own numbers for each. The server keeps
 * your best ever (highest, or lowest for a time), so a fresh save never knocks you down.
 */
export interface Board {
  id: string;
  name: string;
  /** Your number for this board. */
  get: (m: Meta) => number;
  /** How a number reads on the board (default: with thousands commas). */
  show?: (v: number) => string;
  /** Lower is better (a time). */
  low?: boolean;
}

const topHeat = (m: Meta) => Math.max(0, ...Object.values(m.mapHeats ?? {}).flat());

export const BOARDS: Board[] = [
  { id: 'wins', name: 'Runs won', get: (m) => m.wins },
  { id: 'streak', name: 'Best win streak', get: (m) => m.bestStreak ?? 0 },
  { id: 'heat', name: 'Highest Heat won', get: topHeat, show: (v) => `Heat ${v}` },
  { id: 'dex', name: 'Hexlidex forms', get: (m) => m.dex.forms.length },
  { id: 'caught', name: 'Hexlings caught', get: (m) => m.stats.caught },
  { id: 'battles', name: 'Battles won', get: (m) => m.stats.battlesWon },
  { id: 'guardians', name: 'Guardians beaten', get: (m) => m.bossesDefeated },
  { id: 'gilded', name: 'Gilded caught', get: (m) => m.shinyCaught ?? 0 },
  { id: 'legends', name: 'Legendaries caught', get: legendsCaught },
  { id: 'hunt', name: 'Deepest Gilded Hunt', get: (m) => m.bestHunt ?? 0, show: (v) => `Floor ${v}` },
  { id: 'tourney', name: 'Tournaments won', get: (m) => m.tourneyWins ?? 0 },
  { id: 'online', name: 'Online wins', get: (m) => m.onlineWins ?? 0 },
  { id: 'titles', name: 'Titles earned', get: (m) => earnedTitles(m).length },
  { id: 'coins', name: 'Coins earned', get: (m) => m.stats.coinsEarned },
  // Seconds of active play in your fastest won run (0: no win yet).
  { id: 'fastest', name: 'Fastest win', get: (m) => Math.round((m.fastestWin ?? 0) / 1000), show: (v) => formatDuration(v * 1000), low: true },
];

export const showScore = (b: Board, v: number) => (b.show ? b.show(v) : v.toLocaleString());

/** Your number on every board (whole, never negative). */
export function myScores(m: Meta): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of BOARDS) {
    const v = Math.floor(Number(b.get(m)) || 0);
    out[b.id] = Math.max(0, v);
  }
  return out;
}
