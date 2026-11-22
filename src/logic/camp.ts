import { LEGEND_CHANCE, LEGENDS } from '../data/legends';
import { MAP_BY_ID } from '../data/maps';
import { SPECIES_BY_ID } from '../data/species';
import { hashString, Rng } from './rng';
import type { Meta, Run } from './run';

/**
 * Camp: the pre-run choice by the fire, the three daily challenges your visitors hand out (paid in
 * embers), embers to spend on the camp itself, bonding with the Hexlings who stay at camp, and the
 * camp growing as you play. Pure logic; CampScene draws it.
 */

// ---------------------------------------------------------------- your camp's saved state

export interface CampState {
  /** The day (local date) the challenges and the day's care are for. */
  day: string;
  /** Your counters when the day began: a challenge's progress is how far they've moved since. */
  base: Record<string, number>;
  /** Today's challenges claimed (easy, medium, hard). */
  claimed: boolean[];
  /** Challenges completed ever. */
  done: number;
  embers: number;
  /** Decorations and fire colours bought. */
  owned: string[];
  /** Fire colour in use (an owned id), or the plain orange fire. */
  fire?: string;
  /** Who stays at camp (species ids, up to CREW_MAX). Unset: last run's team. */
  crew?: string[];
  /** Lifetime bond with each species, from time at camp. */
  bond: Record<string, number>;
  /** What you've done with each Hexling today ('pet', 'feed', 'play'). */
  cared: Record<string, string[]>;
}

export const CREW_MAX = 3;

/** Today as a local date, YYYY-MM-DD (challenges and care reset at your midnight). */
export function localDay(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** The counters challenges are measured on. */
export function counters(m: Meta): Record<string, number> {
  const s = m.stats;
  return {
    battles: s.battlesWon,
    caught: s.caught,
    evolutions: s.evolutions,
    elites: s.elites,
    guardians: m.bossesDefeated,
    treasures: s.treasures,
    statuses: s.statusInflicted,
    events: s.events,
    coins: s.coinsEarned,
    levelups: s.levelups,
    wins: m.wins,
    runs: m.runs,
  };
}

/** Your camp, set up for today (a new day brings new challenges and fresh care). */
export function camp(m: Meta, now = new Date()): CampState {
  const day = localDay(now);
  const c = (m.camp ??= { day: '', base: {}, claimed: [], done: 0, embers: 0, owned: [], bond: {}, cared: {} });
  if (c.day !== day) {
    c.day = day;
    c.base = counters(m);
    c.claimed = [false, false, false];
    c.cared = {};
  }
  return c;
}

// ---------------------------------------------------------------- daily challenges

export type Tier = 0 | 1 | 2;
export interface ChallengeDef {
  stat: string;
  goal: number;
  text: string;
}
export const TIER_NAMES = ['Easy', 'Medium', 'Hard'];
export const TIER_EMBERS = [3, 6, 12];

const POOLS: ChallengeDef[][] = [
  [
    { stat: 'battles', goal: 5, text: 'Win 5 battles' },
    { stat: 'caught', goal: 3, text: 'Catch 3 Hexlings' },
    { stat: 'events', goal: 2, text: 'Visit 2 event hexes' },
    { stat: 'treasures', goal: 1, text: 'Open a treasure chest' },
    { stat: 'levelups', goal: 8, text: 'Level up 8 times' },
    { stat: 'coins', goal: 150, text: 'Earn 150 coins' },
  ],
  [
    { stat: 'battles', goal: 15, text: 'Win 15 battles' },
    { stat: 'caught', goal: 8, text: 'Catch 8 Hexlings' },
    { stat: 'elites', goal: 2, text: 'Beat 2 trainers' },
    { stat: 'evolutions', goal: 2, text: 'Evolve 2 Hexlings' },
    { stat: 'guardians', goal: 1, text: 'Beat a guardian' },
    { stat: 'statuses', goal: 8, text: 'Inflict 8 status effects' },
    { stat: 'coins', goal: 400, text: 'Earn 400 coins' },
  ],
  [
    { stat: 'wins', goal: 1, text: 'Win a run' },
    { stat: 'guardians', goal: 3, text: 'Beat 3 guardians' },
    { stat: 'elites', goal: 5, text: 'Beat 5 trainers' },
    { stat: 'caught', goal: 15, text: 'Catch 15 Hexlings' },
    { stat: 'evolutions', goal: 4, text: 'Evolve 4 Hexlings' },
    { stat: 'battles', goal: 30, text: 'Win 30 battles' },
  ],
];

/** The day's three challenges (the same for everyone on that date). */
export function challengesFor(day: string): ChallengeDef[] {
  return POOLS.map((pool, t) => pool[hashString(`${day}:camp:${t}`) % pool.length]);
}

export interface ChallengeState extends ChallengeDef {
  tier: Tier;
  progress: number;
  complete: boolean;
  claimed: boolean;
}

export function challenges(m: Meta, now = new Date()): ChallengeState[] {
  const c = camp(m, now);
  const cur = counters(m);
  return challengesFor(c.day).map((d, i) => {
    const progress = Math.max(0, Math.min(d.goal, (cur[d.stat] ?? 0) - (c.base[d.stat] ?? 0)));
    return { ...d, tier: i as Tier, progress, complete: progress >= d.goal, claimed: !!c.claimed[i] };
  });
}

/** Challenges done but not yet claimed (for the "!" over a visitor). */
export const unclaimed = (m: Meta) => challenges(m).filter((ch) => ch.complete && !ch.claimed).length;

/** Claim a finished challenge: its embers. Returns the embers gained (0 if it can't be claimed). */
export function claimChallenge(m: Meta, tier: Tier): number {
  const ch = challenges(m)[tier];
  if (!ch?.complete || ch.claimed) return 0;
  const c = camp(m);
  c.claimed[tier] = true;
  c.done += 1;
  c.embers += TIER_EMBERS[tier];
  return TIER_EMBERS[tier];
}

// ---------------------------------------------------------------- the ember stall

export interface CampItem {
  id: string;
  name: string;
  desc: string;
  cost: number;
  kind: 'decor' | 'fire';
  /** Fire colours: the flame's three colours, outside to in. */
  flame?: [number, number, number];
}

export const CAMP_ITEMS: CampItem[] = [
  { id: 'flowers', name: 'Wildflowers', desc: 'A patch of flowers by the path.', cost: 6, kind: 'decor' },
  { id: 'bench', name: 'Log bench', desc: 'Somewhere to sit by the fire.', cost: 8, kind: 'decor' },
  { id: 'mushrooms', name: 'Mushroom ring', desc: 'A ring of glowing mushrooms.', cost: 10, kind: 'decor' },
  { id: 'lanterns', name: 'String lights', desc: 'Little lights strung over camp.', cost: 14, kind: 'decor' },
  { id: 'pond', name: 'Pond', desc: 'A small pond. Water types love it.', cost: 18, kind: 'decor' },
  { id: 'chimes', name: 'Wind chimes', desc: 'They ring in the breeze.', cost: 12, kind: 'decor' },
  { id: 'crystal', name: 'Glow crystal', desc: 'A crystal that hums at night.', cost: 24, kind: 'decor' },
  { id: 'flag', name: 'Camp flag', desc: 'Your colours, flying high.', cost: 16, kind: 'decor' },
  { id: 'fire-blue', name: 'Blue fire', desc: 'A cool blue campfire.', cost: 20, kind: 'fire', flame: [0x1a5aff, 0x3aa0ff, 0xa0e8ff] },
  { id: 'fire-green', name: 'Green fire', desc: 'An eerie green campfire.', cost: 20, kind: 'fire', flame: [0x1a8a3a, 0x3ad06a, 0xb0ffb0] },
  { id: 'fire-violet', name: 'Violet fire', desc: 'A mystic violet campfire.', cost: 24, kind: 'fire', flame: [0x6a1aa0, 0xa04ae0, 0xe0b0ff] },
  { id: 'fire-gold', name: 'Gilded fire', desc: 'A golden campfire, fit for a champion.', cost: 40, kind: 'fire', flame: [0xb07a10, 0xffc94d, 0xfff4b0] },
];
export const CAMP_ITEM = Object.fromEntries(CAMP_ITEMS.map((i) => [i.id, i])) as Record<string, CampItem>;

export function buyCampItem(m: Meta, id: string): string | null {
  const c = camp(m);
  const item = CAMP_ITEM[id];
  if (!item) return 'Not for sale.';
  if (c.owned.includes(id)) return 'You already have it.';
  if (c.embers < item.cost) return `You need ${item.cost - c.embers} more embers.`;
  c.embers -= item.cost;
  c.owned.push(id);
  if (item.kind === 'fire') c.fire = id;
  return null;
}

/** The fire's colours (outside to in). */
export function fireColors(m: Meta): [number, number, number] {
  const f = m.camp?.fire;
  return (f && m.camp?.owned.includes(f) && CAMP_ITEM[f]?.flame) || [0xff4a1a, 0xff8a2a, 0xffd04a];
}

// ---------------------------------------------------------------- your camp grows

/** What's built at camp from what you've done (CampScene draws each one). */
export interface Growth {
  tents: number;
  banners: string[];
  lanterns: number;
  board: number;
  shrine: boolean;
  statues: string[];
  fire: number;
}

export function growth(m: Meta, dexTotal: number): Growth {
  const heat = Math.max(0, ...Object.values(m.mapHeats ?? {}).flat());
  return {
    tents: m.runs >= 100 ? 3 : m.runs >= 25 ? 2 : m.runs >= 5 ? 1 : 0,
    banners: m.clearedMaps.filter((id) => MAP_BY_ID[id]),
    lanterns: heat,
    board: dexTotal ? Math.floor((m.dex.forms.length / dexTotal) * 100) : 0,
    shrine: (m.shinyCaught ?? 0) > 0,
    statues: LEGENDS.filter((l) => m.legends?.[l.id]?.caught).map((l) => l.id),
    fire: m.wins >= 50 ? 3 : m.wins >= 10 ? 2 : m.wins >= 1 ? 1 : 0,
  };
}

// ---------------------------------------------------------------- bonding at camp

export const CARE = ['pet', 'feed', 'play'] as const;
export type Care = (typeof CARE)[number];
/** Camp bond points for each heart; three hearts and that species starts runs with a bond heart. */
export const CAMP_HEARTS = [3, 10, 21];
/** Bond a Hexling starts a run with once its camp bond is full (one bond heart). */
export const CAMP_START_BOND = 3;

export const campHearts = (m: Meta, speciesId: string) => CAMP_HEARTS.filter((n) => (m.camp?.bond[speciesId] ?? 0) >= n).length;

/** Spend time with a Hexling (each kind once a day). Returns the hearts gained (0 or 1), or null if already done today. */
export function care(m: Meta, speciesId: string, what: Care): number | null {
  const c = camp(m);
  const done = (c.cared[speciesId] ??= []);
  if (done.includes(what)) return null;
  done.push(what);
  const before = campHearts(m, speciesId);
  c.bond[speciesId] = (c.bond[speciesId] ?? 0) + 1;
  return campHearts(m, speciesId) - before;
}

export const caredToday = (m: Meta, speciesId: string): string[] => (m.camp?.day === localDay() ? (m.camp.cared[speciesId] ?? []) : []);

/** The species you're closest to at camp. */
export function closestBond(m: Meta): { speciesId: string; points: number } | null {
  const e = Object.entries(m.camp?.bond ?? {})
    .filter(([id]) => SPECIES_BY_ID[id])
    .sort((a, b) => b[1] - a[1])[0];
  return e ? { speciesId: e[0], points: e[1] } : null;
}

/**
 * At camp a Hexling's form follows your bond, not its level: it starts in its first form, and each
 * camp heart evolves it (first heart: middle form, second: final form; the third adds a glow).
 */
export const campStage = (m: Meta, speciesId: string) => Math.min(campHearts(m, speciesId), 2);

/** Who stays at camp: your pick, else last run's team (or your first starters), in their camp forms. */
export function campCrew(m: Meta): { speciesId: string; stage: number; shiny: boolean }[] {
  const shiny = (id: string) => (m.shinyOwned ?? []).includes(id) && !(m.shinyOff ?? []).includes(id);
  const ids = m.camp?.crew?.length
    ? m.camp.crew
    : m.history?.[0]?.team.length
      ? m.history[0].team.slice(0, CREW_MAX).map((c) => c.speciesId)
      : m.unlockedStarters.slice(0, CREW_MAX);
  return ids.filter((id) => SPECIES_BY_ID[id]).map((id) => ({ speciesId: id, stage: campStage(m, id), shiny: shiny(id) }));
}

/** Runs that are the same for everyone don't get camp perks. */
export const campPerks = (run: Run) => !run.daily && !run.weekly && !run.hunt;

/** A Hexling joining your team: a full camp bond means it starts with a bond heart. */
export function applyCampBond(run: Run, c: { speciesId: string; bond?: number }) {
  if (!campPerks(run) || run.race) return;
  if (campHearts(run.meta, c.speciesId) >= CAMP_HEARTS.length) c.bond = Math.max(c.bond ?? 0, CAMP_START_BOND);
}

// ---------------------------------------------------------------- the choice before a run

export type PrepId = 'purse' | 'potions' | 'held' | 'stone' | 'haggle' | 'charm';
export interface PrepDef {
  id: PrepId;
  name: string;
  desc: string;
  /** Who offers it at the fire. */
  from: 'Mori' | 'Professor Alder' | 'Camp';
}
export const PREPS: Record<PrepId, PrepDef> = {
  purse: { id: 'purse', name: 'Coin purse', desc: 'Start with 60 coins.', from: 'Mori' },
  potions: { id: 'potions', name: 'Potion pack', desc: 'Start with 2 potions.', from: 'Mori' },
  held: { id: 'held', name: 'Trinket', desc: 'Start with a random held item in your bag.', from: 'Mori' },
  stone: { id: 'stone', name: 'Evolution Stone', desc: 'Start with an Evolution Stone.', from: 'Professor Alder' },
  haggle: { id: 'haggle', name: 'Mori’s coupon', desc: 'Everything in shops costs 25% less on the first floor.', from: 'Mori' },
  charm: { id: 'charm', name: 'Campfire stories', desc: 'Your starter begins with a bond heart.', from: 'Camp' },
};

/** The three choices at the fire for this run (the same for everyone in an online race). */
export function prepOffers(seed: number): PrepId[] {
  const rng = new Rng(hashString(`${seed}:prep`));
  return rng.shuffle(Object.keys(PREPS) as PrepId[]).slice(0, 3);
}

/** Whether this run stops at camp before the map (not dailies, weeklies or a hunt). */
export const prepsAvailable = (run: Run) => campPerks(run) && !run.prep;

/** Floors of this run a legendary will roam (Professor Alder's news). */
export function legendFloors(run: Run, floors: number): number[] {
  if (run.race || run.daily || run.weekly || run.hunt) return [];
  if (!LEGENDS.some((l) => !run.meta.legends?.[l.id]?.caught)) return [];
  const out: number[] = [];
  for (let f = 1; f < floors; f++) if (hashString(`${run.seed}:roam:${f}`) % 1000 < LEGEND_CHANCE * 1000) out.push(f);
  return out;
}

/** The Hexling that sits with you at friends' camps: your favourite, else your latest starter. */
export function myBuddy(m: Meta): { id: string; stage: number; shiny: boolean } | null {
  const id = (m.favorite && SPECIES_BY_ID[m.favorite] && m.favorite) || (m.lastStarter && SPECIES_BY_ID[m.lastStarter] && m.lastStarter) || m.history?.[0]?.team[0]?.speciesId;
  if (!id || !SPECIES_BY_ID[id]) return null;
  const stage = Math.max(0, ...m.dex.forms.filter((f) => f.startsWith(`${id}:`)).map((f) => Number(f.split(':')[1]) || 0));
  return { id, stage, shiny: (m.shinyOwned ?? []).includes(id) && !(m.shinyOff ?? []).includes(id) };
}

/**
 * Embers from a finished run (2.0), win or lose: 5 per floor cleared, +3 per guardian beaten, +1 per
 * battle won (up to 10), +15
 * for winning, +2 per Gilded caught, +3 per Gilded Hunt floor; +10% per Heat level. About 8-15 for
 * a loss and 35-50 for a win.
 */
export function runEmbers(run: import('./run').Run, won: boolean): { total: number; lines: string[] } {
  const floors = won ? 3 : run.floor;
  const lines: string[] = [];
  let n = 0;
  const add = (amount: number, label: string) => {
    if (amount <= 0) return;
    n += amount;
    lines.push(`+${amount} ${label}`);
  };
  add(5 * floors, `${floors} floor${floors === 1 ? '' : 's'} cleared`);
  add(3 * floors, `${floors} guardian${floors === 1 ? '' : 's'} beaten`);
  // Even a quick loss pays: 1 per battle won (up to 10).
  add(Math.min(10, run.log.battlesWon), 'battles won');
  if (won) add(15, 'victory');
  const gilded = [...run.team, ...run.bench].filter((c) => c.shiny).length;
  add(2 * gilded, 'Gilded on your team');
  if (run.hunt) add(3 * Math.max(0, run.hunt.depth - 1), 'Gilded Hunt floors');
  const heat = run.heat ?? 0;
  if (heat) {
    const extra = Math.round(n * 0.1 * heat);
    add(extra, `Heat ${heat}`);
  }
  return { total: n, lines };
}

/** Pay a run's embers once (the end screen can be laid out more than once). */
export function payRunEmbers(meta: Meta, run: import('./run').Run, won: boolean): { total: number; lines: string[] } {
  const res = runEmbers(run, won);
  if (run.embersPaid) return res;
  run.embersPaid = true;
  camp(meta).embers += res.total;
  return res;
}
