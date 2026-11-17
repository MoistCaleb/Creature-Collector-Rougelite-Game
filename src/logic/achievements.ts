import type { Meta, PassiveId } from './run';

/** Lifetime counters (across all runs) that achievements track. */
export interface MetaStats {
  rests: number;
  caught: number;
  battlesWon: number;
  evolutions: number;
  events: number;
  coinsEarned: number;
  levelups: number;
  skillUps: number;
  stars: number;
  wipes: number;
  elites: number;
  treasures: number;
  potionsUsed: number;
  heldEquipped: number;
  statusInflicted: number;
  synergyWins: number;
}

export const emptyStats = (): MetaStats => ({
  rests: 0,
  caught: 0,
  battlesWon: 0,
  evolutions: 0,
  events: 0,
  coinsEarned: 0,
  levelups: 0,
  skillUps: 0,
  stars: 0,
  wipes: 0,
  elites: 0,
  treasures: 0,
  potionsUsed: 0,
  heldEquipped: 0,
  statusInflicted: 0,
  synergyWins: 0,
});

export type StatKey = keyof MetaStats | 'coinsSpent' | 'wins' | 'bossesDefeated' | 'speciesCaught' | 'heatUnlocked';

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
  { id: 'collector', name: 'Collector', desc: 'Catch 10 Hexlings', stat: 'caught', goal: 10, passive: 'scout' },
  { id: 'veteran', name: 'Veteran', desc: 'Win 50 battles', stat: 'battlesWon', goal: 50, passive: 'drill' },
  { id: 'big-spender', name: 'Big Spender', desc: 'Spend 500 coins', stat: 'coinsSpent', goal: 500, passive: 'haggler' },
  { id: 'metamorphosis', name: 'Metamorphosis', desc: 'Evolve 5 Hexlings', stat: 'evolutions', goal: 5, passive: 'evolutionist' },
  { id: 'wanderer', name: 'Wanderer', desc: 'Resolve 20 events', stat: 'events', goal: 20, passive: 'explorer' },
  { id: 'champion', name: 'Champion', desc: 'Win a run', stat: 'wins', goal: 1, passive: 'champion' },
  { id: 'prospector', name: 'Prospector', desc: 'Earn 2,000 coins', stat: 'coinsEarned', goal: 2000, passive: 'coinpurse' },
  { id: 'drill-master', name: 'Drill Master', desc: 'Train at 15 Level Up nodes', stat: 'levelups', goal: 15, passive: 'trainer' },
  { id: 'scholar', name: 'Scholar', desc: 'Upgrade 15 moves', stat: 'skillUps', goal: 15, passive: 'sage' },
  { id: 'ascension', name: 'Ascension', desc: 'Earn 10 prestige stars', stat: 'stars', goal: 10, passive: 'ascendant' },
  { id: 'second-wind', name: 'Second Wind', desc: 'Survive 3 team wipes', stat: 'wipes', goal: 3, passive: 'bodyguard' },
  { id: 'elite-hunter', name: 'Trainer Hunter', desc: 'Defeat 10 trainers', stat: 'elites', goal: 10, passive: 'hunter' },
  { id: 'naturalist', name: 'Naturalist', desc: 'Catch 40 different species', stat: 'speciesCaught', goal: 40, passive: 'naturalist' },
  { id: 'guardian-slayer', name: 'Guardian Slayer', desc: 'Defeat 15 floor bosses', stat: 'bossesDefeated', goal: 15, passive: 'ironwill' },
  { id: 'treasure-hunter', name: 'Treasure Hunter', desc: 'Open 15 treasure chests', stat: 'treasures', goal: 15, passive: 'lucky' },
  { id: 'chemist', name: 'Chemist', desc: 'Use 15 potions', stat: 'potionsUsed', goal: 15, passive: 'apothecary' },
  { id: 'outfitter', name: 'Outfitter', desc: 'Give your Hexlings 10 held items', stat: 'heldEquipped', goal: 10, passive: 'quartermaster' },
  { id: 'hexer', name: 'Hexer', desc: 'Inflict 30 status conditions', stat: 'statusInflicted', goal: 30, passive: 'afflicter' },
  { id: 'trial-by-fire', name: 'Trial by Fire', desc: 'Win a run at Heat 2', stat: 'heatUnlocked', goal: 2, passive: 'tempered' },
  { id: 'in-tune', name: 'In Tune', desc: 'Win 25 battles with a team synergy active', stat: 'synergyWins', goal: 25, passive: 'harmonist' },
];

export function achievementFor(passive: PassiveId): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.passive === passive);
}

export function progress(meta: Meta, a: Achievement): number {
  if (a.stat === 'coinsSpent') return meta.coinsSpent;
  if (a.stat === 'wins') return meta.wins;
  if (a.stat === 'bossesDefeated') return meta.bossesDefeated;
  if (a.stat === 'speciesCaught') return meta.dex.caught.length;
  // Highest Heat won at (winning at Heat N unlocks N+1).
  if (a.stat === 'heatUnlocked') return Math.max(0, (meta.heatUnlocked ?? 0) - 1);
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
