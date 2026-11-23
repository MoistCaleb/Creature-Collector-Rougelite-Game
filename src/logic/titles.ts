import { DEX_SPECIES } from '../data/legends';
import { MAPS } from '../data/maps';
import { SURPRISE_LIST } from '../data/surprises';
import { ELEMENTS } from '../data/types';
import type { Meta } from './run';

/**
 * Trainer titles: shown under your name, and to your opponent online. Each has a tier by how hard
 * it is to earn, and the tier sets its color and effect (see ui/titleBadge).
 */
export type TitleTier = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export const TIERS: TitleTier[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

export const TIER_INFO: Record<TitleTier, { name: string; color: string; mark: string }> = {
  common: { name: 'Common', color: '#dfe4ee', mark: '' },
  rare: { name: 'Rare', color: '#5cc2ff', mark: '◆ ' },
  epic: { name: 'Epic', color: '#c98cff', mark: '✦ ' },
  legendary: { name: 'Legendary', color: '#ffc94d', mark: '★ ' },
  mythic: { name: 'Mythic', color: '#ff7ad9', mark: '✶ ' },
};

export interface TitleDef {
  name: string;
  tier: TitleTier;
  /** How to earn it. */
  desc: string;
  /** Progress toward it: [have, need]. Earned when have >= need. */
  progress: (meta: Meta) => [number, number];
  /** Earned from a Gilded or Gilded Hunt milestone (announced with the milestone, not on its own). */
  gilded?: boolean;
}

/** The highest Heat won on any map. */
const topHeat = (meta: Meta) => Math.max(0, ...Object.values(meta.mapHeats ?? {}).flat());
const mapsWonAt = (meta: Meta, heat: number) => MAPS.filter((m) => (meta.mapHeats?.[m.id] ?? []).includes(heat)).length;
const weeklyWins = (meta: Meta) => Object.values(meta.weeklies ?? {}).filter((w) => w.best?.won).length;
const gilded = (meta: Meta) => (meta.shinyOwned ?? []).length;
/** Rare surprises found (2.0), and lands whose Elder you've beaten. */
/** A friend's ghost needs friends, so it isn't needed for the collection titles. */
const COLLECTABLE = SURPRISE_LIST.filter((s) => s.id !== 'ghost');
const found = (meta: Meta) => COLLECTABLE.filter((s) => (meta.surprisesFound ?? []).includes(s.id)).length;
const elders = (meta: Meta) => ELEMENTS.filter((e) => (meta.eldersBeaten ?? []).includes(e)).length;

export const TITLES: TitleDef[] = [
  // Common
  { name: 'Rookie', tier: 'common', desc: 'Finish your first run.', progress: (m) => [m.runs, 1] },
  { name: 'Pathfinder', tier: 'common', desc: 'Play 10 runs.', progress: (m) => [m.runs, 10] },
  { name: 'Wrangler', tier: 'common', desc: 'Catch 25 Hexlings.', progress: (m) => [m.stats.caught, 25] },
  { name: 'Treasure Hound', tier: 'common', desc: 'Open 25 treasure chests.', progress: (m) => [m.stats.treasures, 25] },
  // Rare
  { name: 'Champion', tier: 'rare', desc: 'Win a run.', progress: (m) => [m.wins, 1] },
  { name: 'Guardian Breaker', tier: 'rare', desc: 'Defeat 25 guardians.', progress: (m) => [m.bossesDefeated, 25] },
  { name: 'Field Researcher', tier: 'rare', desc: 'Catch 50 different species.', progress: (m) => [m.dex.caught.length, 50] },
  { name: 'Arena Ace', tier: 'rare', desc: 'Win all 5 Battle Arena rounds.', progress: (m) => [m.arenaBest ?? 0, 5] },
  { name: 'Bracket Buster', tier: 'rare', desc: 'Win an Arena tournament.', progress: (m) => [m.tourneyWins ?? 0, 1] },
  { name: 'Duelist', tier: 'rare', desc: 'Win an online duel or stage battle.', progress: (m) => [m.onlineWins ?? 0, 1] },
  { name: 'Gilded Seeker', tier: 'rare', desc: 'Own 5 Gilded species.', progress: (m) => [gilded(m), 5], gilded: true },
  // Epic
  { name: 'Heatseeker', tier: 'epic', desc: 'Win a run at Heat 4 or higher.', progress: (m) => [Math.min(topHeat(m), 4), 4] },
  { name: 'Unbroken', tier: 'epic', desc: 'Win 5 runs in a row.', progress: (m) => [m.bestStreak ?? 0, 5] },
  { name: 'Cartographer', tier: 'epic', desc: 'Win a run on every map.', progress: (m) => [MAPS.filter((x) => m.clearedMaps.includes(x.id)).length, MAPS.length] },
  { name: 'Deep Diver', tier: 'epic', desc: 'Reach floor 5 of a Gilded Hunt.', progress: (m) => [m.bestHunt ?? 0, 5], gilded: true },
  { name: 'Hunt Master', tier: 'epic', desc: 'Reach floor 12 of a Gilded Hunt.', progress: (m) => [m.bestHunt ?? 0, 12], gilded: true },
  { name: 'Weekly Victor', tier: 'epic', desc: 'Win 3 weekly challenges.', progress: (m) => [weeklyWins(m), 3] },
  { name: 'Rival', tier: 'epic', desc: 'Win 10 online duels or stage battles.', progress: (m) => [m.onlineWins ?? 0, 10] },
  { name: 'Grand Champion', tier: 'epic', desc: 'Win 5 Arena tournaments.', progress: (m) => [m.tourneyWins ?? 0, 5] },
  { name: 'Royale Victor', tier: 'epic', desc: 'Win a battle royale with 4 or more players.', progress: (m) => [(m.royaleBest ?? 0) >= 4 ? 1 : 0, 1] },
  { name: 'Curious', tier: 'epic', desc: 'Find 10 different rare surprises.', progress: (m) => [Math.min(found(m), 10), 10] },
  { name: 'Gilded Collector', tier: 'epic', desc: 'Own 30 Gilded species.', progress: (m) => [gilded(m), 30], gilded: true },
  // Legendary
  { name: 'Inferno Walker', tier: 'legendary', desc: 'Win a run at Heat 8.', progress: (m) => [Math.min(topHeat(m), 8), 8] },
  { name: 'Living Legend', tier: 'legendary', desc: 'Win 10 runs in a row.', progress: (m) => [m.bestStreak ?? 0, 10] },
  { name: 'Hexlidex Master', tier: 'legendary', desc: `Catch all ${DEX_SPECIES.length} species, legendaries included.`, progress: (m) => [m.dex.caught.length, DEX_SPECIES.length] },
  { name: 'Grand Duelist', tier: 'legendary', desc: 'Win 50 online duels or stage battles.', progress: (m) => [m.onlineWins ?? 0, 50] },
  { name: 'Royale Champion', tier: 'legendary', desc: 'Win a battle royale with 6 or more players.', progress: (m) => [(m.royaleBest ?? 0) >= 6 ? 1 : 0, 1] },
  { name: 'Abyss Diver', tier: 'legendary', desc: 'Reach floor 18 of a Gilded Hunt.', progress: (m) => [m.bestHunt ?? 0, 18], gilded: true },
  { name: 'Elder Slayer', tier: 'legendary', desc: `Beat the Elder guardian of all ${ELEMENTS.length} lands.`, progress: (m) => [elders(m), ELEMENTS.length] },
  { name: 'Wonderfinder', tier: 'legendary', desc: `Find all ${COLLECTABLE.length} rare surprises.`, progress: (m) => [found(m), COLLECTABLE.length] },
  { name: 'Gilded Legend', tier: 'legendary', desc: 'Own 60 Gilded species.', progress: (m) => [gilded(m), 60], gilded: true },
  // Mythic
  { name: 'Unstoppable', tier: 'mythic', desc: 'Win 20 runs in a row.', progress: (m) => [m.bestStreak ?? 0, 20] },
  { name: 'Hexbound', tier: 'mythic', desc: 'Win at Heat 8 on every map.', progress: (m) => [mapsWonAt(m, 8), MAPS.length] },
  { name: 'Battle Monarch', tier: 'mythic', desc: 'Win an 8-player battle royale.', progress: (m) => [(m.royaleBest ?? 0) >= 8 ? 1 : 0, 1] },
  { name: 'Endless Hunter', tier: 'mythic', desc: 'Reach floor 30 of a Gilded Hunt.', progress: (m) => [m.bestHunt ?? 0, 30], gilded: true },
  { name: 'Gilded Master', tier: 'mythic', desc: 'Own 120 Gilded species.', progress: (m) => [gilded(m), 120], gilded: true },
];

export const TITLE_BY_NAME: Record<string, TitleDef> = Object.fromEntries(TITLES.map((t) => [t.name, t]));

/** The tier of a title (common for unknown ones). */
export const tierOf = (name: string): TitleTier => TITLE_BY_NAME[name]?.tier ?? 'common';

export const hasTitle = (meta: Meta, t: TitleDef): boolean => {
  const [have, need] = t.progress(meta);
  return have >= need;
};

/** Titles you've earned, rarest first. */
export function earnedTitles(meta: Meta): string[] {
  return TITLES.filter((t) => hasTitle(meta, t))
    .sort((a, b) => TIERS.indexOf(b.tier) - TIERS.indexOf(a.tier))
    .map((t) => t.name);
}

/** Your shown title (null: none chosen, or no longer valid). */
export function myTitle(meta: Meta): string | null {
  const t = meta.trainerTitle;
  return t && TITLE_BY_NAME[t] && hasTitle(meta, TITLE_BY_NAME[t]) ? t : null;
}

/** A title from the other player, if it's one we know (anything else is dropped). */
export const cleanTitle = (t: unknown): string | undefined => (typeof t === 'string' && TITLE_BY_NAME[t] ? t : undefined);

/**
 * Titles earned since they were last announced (and marks them announced). Gilded titles are
 * marked but not returned: their milestone announces them. When you aren't showing a title, the
 * rarest new one is worn straight away. Caller saves meta.
 */
export function takeNewTitles(meta: Meta): TitleDef[] {
  const seen = new Set(meta.titlesAnnounced ?? []);
  const fresh = TITLES.filter((t) => !seen.has(t.name) && hasTitle(meta, t));
  if (!fresh.length) return [];
  meta.titlesAnnounced = [...seen, ...fresh.map((t) => t.name)];
  const best = [...fresh].sort((a, b) => TIERS.indexOf(b.tier) - TIERS.indexOf(a.tier))[0];
  if (!myTitle(meta)) meta.trainerTitle = best.name;
  return fresh.filter((t) => !t.gilded);
}

/** Count a battle royale win with this many players (also an online win). Returns titles earned; caller saves meta. */
export function addRoyaleWin(meta: Meta, players: number): TitleDef[] {
  meta.royaleBest = Math.max(meta.royaleBest ?? 0, players);
  return addOnlineWin(meta);
}

/** Count an online win (a duel series or a stage battle) and return any titles it earned. Caller saves meta. */
export function addOnlineWin(meta: Meta): TitleDef[] {
  meta.onlineWins = (meta.onlineWins ?? 0) + 1;
  meta.onlineStreak = (meta.onlineStreak ?? 0) + 1;
  meta.bestOnlineStreak = Math.max(meta.bestOnlineStreak ?? 0, meta.onlineStreak);
  return takeNewTitles(meta);
}

/** Count a lost online game (a duel series, stage battle, battle royale or online tournament). Caller saves meta. */
export function addOnlineLoss(meta: Meta) {
  meta.onlineLosses = (meta.onlineLosses ?? 0) + 1;
  meta.onlineStreak = 0;
}
