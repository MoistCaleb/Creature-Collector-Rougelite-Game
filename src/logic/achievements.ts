import type { Meta, PassiveId } from './run';

/** Lifetime counters (across all runs) that achievements track. */
export interface MetaStats {
  rests: number;
  caught: number;
  battlesWon: number;
  evolutions: number;
  events: number;
}

export const emptyStats = (): MetaStats => ({ rests: 0, caught: 0, battlesWon: 0, evolutions: 0, events: 0 });

export type StatKey = keyof MetaStats | 'coinsSpent' | 'wins';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  stat: StatKey;
  goal: number;
  passive: PassiveId;
}

/** Each achievement unlocks one trainer passive. Progress counts across every run, won or lost. */
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-aid', name: 'First Aid', desc: 'Rest at 10 Rest nodes', stat: 'rests', goal: 10, passive: 'medic' },
  { id: 'collector', name: 'Collector', desc: 'Catch 10 creatures', stat: 'caught', goal: 10, passive: 'scout' },
  { id: 'veteran', name: 'Veteran', desc: 'Win 50 battles', stat: 'battlesWon', goal: 50, passive: 'drill' },
  { id: 'big-spender', name: 'Big Spender', desc: 'Spend 500 coins', stat: 'coinsSpent', goal: 500, passive: 'haggler' },
  { id: 'metamorphosis', name: 'Metamorphosis', desc: 'Evolve 5 creatures', stat: 'evolutions', goal: 5, passive: 'evolutionist' },
  { id: 'wanderer', name: 'Wanderer', desc: 'Resolve 20 events', stat: 'events', goal: 20, passive: 'explorer' },
  { id: 'champion', name: 'Champion', desc: 'Win a run', stat: 'wins', goal: 1, passive: 'champion' },
];

export function achievementFor(passive: PassiveId): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.passive === passive);
}

export function progress(meta: Meta, a: Achievement): number {
  if (a.stat === 'coinsSpent') return meta.coinsSpent;
  if (a.stat === 'wins') return meta.wins;
  return meta.stats[a.stat];
}

/** Unlock any achievements whose goal is now met. Returns the newly earned ones (also queued for display). */
export function checkAchievements(meta: Meta): Achievement[] {
  const earned: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (meta.achievements.includes(a.id) || progress(meta, a) < a.goal) continue;
    meta.achievements.push(a.id);
    if (!meta.unlockedPassives.includes(a.passive)) meta.unlockedPassives.push(a.passive);
    meta.newAchievements.push(a.id);
    earned.push(a);
  }
  return earned;
}

/** Bump a lifetime counter and check achievements. Caller saves meta. */
export function track(meta: Meta, stat: keyof MetaStats, by = 1): Achievement[] {
  meta.stats[stat] += by;
  return checkAchievements(meta);
}
