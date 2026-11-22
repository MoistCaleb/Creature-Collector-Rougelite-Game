import { APP_VERSION } from '../data/changelog';
import { BOSSES, EXTRA_RULE_LEVELS, extraRuleCount, TRAINER_NAMES } from '../data/trainers';
import { pickLine, RIVAL_HELLO, RIVAL_LOST, RIVAL_SKIPPED } from '../data/dialogue';
import * as storage from '../storage';
import { BALANCE } from '../data/balance';
import { HELD, HELD_IDS, type HeldId } from '../data/held';
import { heatRules, MAX_HEAT } from '../data/heat';
import { MAP_BY_ID, MAPS, mapUnlocked } from '../data/maps';
import { bondHearts, natureFor } from '../data/natures';
import { rollTrait, traitOf, traitValue, type TraitId } from '../data/traits';
import { isLegend, LEGEND_CHANCE, LEGEND_RECOVER, LEGENDS } from '../data/legends';
import { NIGHT_SHARE, nightOut } from './ambience';
import { DEFAULT_STARTERS, SPECIES, SPECIES_BY_ID, speciesWithElement, type Species } from '../data/species';
import { MOVES, teamMoveId } from '../data/moves';
import { ELEMENTS, typeMultiplier, type Element, type TypePair } from '../data/types';
import {
  bankLimit,
  gainXp,
  healFraction,
  catchUpMultiplier,
  createCreature,
  creatureName,
  prestige,
  canPrestige,
  sharesType,
  evolve,
  setNextUid,
  xpToNext,
  creatureTypes,
  isAlive,
  releaseBanked,
  restoreUses,
  setFloorCeiling,
  setLand,
  stageCap,
  stats,
  MAX_MOVES,
  MAX_STARS,
  teamElement,
  type Creature,
  cureStatus,
} from './creature';
import { earnedTitles } from './titles';
import { itemId, unlockedExtras } from './cosmetics';
import { checkAchievements, emptyStats, track, type MetaStats } from './achievements';
import { applyCampBond, camp, CAMP_START_BOND, type PrepId } from './camp';
import { lines, noteCatch, noteRunRecord } from './dexInfo';
import { emptyDex, type Dex } from './dex';
import type { Shop } from './shop';
import { generateFloor, type FloorMap, type MapNode, type NodeKind } from './map';
import { hashString, Rng } from './rng';

export const TEAM_MAX = 4;
export const BENCH_MAX = 3;
export const FLOORS = 3;

// ---------------------------------------------------------------- passives

export type PassiveId =
  | 'apothecary'
  | 'quartermaster'
  | 'afflicter'
  | 'tempered'
  | 'harmonist'
  | 'mentor'
  | 'medic'
  | 'scout'
  | 'drill'
  | 'haggler'
  | 'evolutionist'
  | 'explorer'
  | 'champion'
  | 'coinpurse'
  | 'trainer'
  | 'sage'
  | 'ascendant'
  | 'bodyguard'
  | 'hunter'
  | 'naturalist'
  | 'ironwill'
  | 'lucky';

/** Trainer passives. All but Mentor unlock through achievements (see achievements.ts). */
export const PASSIVES: Record<PassiveId, { name: string; desc: string }> = {
  mentor: { name: 'Mentor', desc: 'Bench Hexlings earn full XP instead of half.' },
  medic: { name: 'Field Medic', desc: 'Rest nodes heal your team to full.' },
  scout: { name: 'Scout', desc: 'Caught Hexlings arrive 3 levels higher.' },
  drill: { name: 'Drill Sergeant', desc: 'Your Hexlings deal 10% more damage.' },
  haggler: { name: 'Haggler', desc: 'Shop prices are 25% lower.' },
  evolutionist: { name: 'Evolutionist', desc: 'Start each run with an Evolution Stone.' },
  explorer: { name: 'Explorer', desc: 'Treasure chests hold 50% more coins.' },
  champion: { name: 'Champion', desc: 'Your starter begins at level 10.' },
  coinpurse: { name: 'Coin Purse', desc: 'Start each run with 50 coins.' },
  trainer: { name: 'Personal Trainer', desc: 'Level Up nodes give 50% more levels.' },
  sage: { name: 'Sage', desc: 'Skill Shrines offer 4 choices instead of 3.' },
  ascendant: { name: 'Ascendant', desc: 'Once per floor, a Prestige Altar needs no sacrifice.' },
  bodyguard: { name: 'Bodyguard', desc: 'Bench steps in fully healed after a wipe.' },
  hunter: { name: 'Big Game Hunter', desc: 'Trainers always drop an Evolution Stone, sometimes 2.' },
  naturalist: { name: 'Naturalist', desc: 'Wild battles give 25% more XP.' },
  ironwill: { name: 'Iron Will', desc: 'Survivors heal 55% after wins, not 40%.' },
  lucky: { name: 'Lucky Charm', desc: 'Coin-flip events succeed 75% of the time.' },
  apothecary: { name: 'Apothecary', desc: '2 starting potions, carry 8, they heal 75%.' },
  quartermaster: { name: 'Quartermaster', desc: 'Start each run with two random held items.' },
  afflicter: { name: 'Afflicter', desc: 'Your moves inflict statuses twice as often.' },
  tempered: { name: 'Tempered', desc: 'Your Hexlings can\u2019t be burned or poisoned.' },
  harmonist: { name: 'Harmonist', desc: 'Team synergy bonuses are doubled.' },
};

// ---------------------------------------------------------------- meta save

export interface Meta {
  /** Roaming legendaries: health left (a share) and whether caught. */
  legends?: Record<string, { hp: number; caught?: boolean; met?: number }>;
  unlockedStarters: string[];
  unlockedPassives: PassiveId[];
  equippedPassive: PassiveId | null;
  runs: number;
  wins: number;
  dex: Dex;
  coinsSpent: number;
  bossesDefeated: number;
  clearedMaps: string[];
  lastMap: string;
  stats: MetaStats;
  achievements: string[];
  /** Achievements earned but not yet announced. */
  newAchievements: string[];
  /** Highest Heat level unlocked (win at your top Heat to unlock the next). */
  heatUnlocked?: number;
  /** Heat chosen for the next run. */
  heat?: number;
  /** Battle Arena team (Lv 50 mode) and best ladder result (rounds won). */
  arenaTeam?: import('./arena').ArenaPick[];
  /** Saved teams for the Arena and duels (replaces arenaTeam), and which one is active. */
  arenaTeams?: import('./arena').SavedTeam[];
  arenaTeamIndex?: number;
  arenaBest?: number;
  /** Creatures saved at the end of runs, to reuse in the team builder. */
  loadouts?: import('./arena').SavedLoadout[];
  /** Your trainer's name: shown in battles and to the other player online. */
  duelName?: string;
  /** How your trainer looks (see data/trainerLook). */
  trainerLook?: import('../data/trainerLook').TrainerLook;
  /** Heat levels (1-8) won on each map, for the map's Heat tokens. */
  mapHeats?: Record<string, number[]>;
  /** The most recent daily played (kept for older saves; see dailies). */
  daily?: DailyRecord;
  /** Every daily played, by date: best result and how many tries. */
  dailies?: Record<string, DailyRecord>;
  /** Favorite evolution line (species id): always one of the starter choices. */
  favorite?: string;
  /** Finished runs, newest first (see recordRun). */
  history?: RunRecord[];
  /** Runs won in a row right now, and the best streak ever. */
  streak?: number;
  bestStreak?: number;
  /** How many runs each species (by base id) finished on your team, alive or fallen. */
  usage?: Record<string, number>;
  /** Deepest Shiny Hunting floor reached, and the most shinies caught in one hunt. */
  bestHunt?: number;
  /** The Heat of that deepest hunt (the higher Heat wins a tie in depth). */
  bestHuntHeat?: number;
  bestHuntShinies?: number;
  /**
   * Species you've caught (or claimed) shiny, in any form: every form of the line is unlocked shiny
   * (as a starter, in the Arena and in online duels).
   */
  shinyOwned?: string[];
  /** Shiny-unlocked species you've chosen to start runs with in their normal colours. */
  shinyOff?: string[];
  /** Shiny Hexlings: species ids ever seen shiny, and how many you've caught. */
  shinySeen?: string[];
  shinyCaught?: number;
  /** Every weekly challenge played, by week (its Monday): best result and how many tries. */
  weeklies?: Record<string, DailyRecord>;
  /** Trainer title shown under your name (see logic/titles). */
  trainerTitle?: string;
  /** Titles already announced as earned. */
  titlesAnnounced?: string[];
  /**
   * Single-player runs won and lost, for the W/L (from v1.47: seeded from your recent runs, then
   * every run that ends, abandoned runs as losses). Separate from `wins`, which unlocks things.
   */
  runRecord?: { wins: number; losses: number };
  /** The game version that last saved this (from v1.52). */
  savedBy?: string;
  /** Online games won: duels (series), stage battles, battle royales and online tournaments. */
  onlineWins?: number;
  /** Online games lost (counted from v1.46), and online wins in a row (now and best). */
  onlineLosses?: number;
  onlineStreak?: number;
  bestOnlineStreak?: number;
  /** Most players in a battle royale you won (for the battle royale titles). */
  royaleBest?: number;
  /** Arena tournament in progress (saved so it survives closing the app), and tournaments won. */
  tourney?: import('./tournament').Tournament;
  tourneyWins?: number;
  /** Reward gear (look part:option) and titles already looked at, for the NEW tags. */
  seenItems?: string[];
  seenTitles?: string[];
  /** Highest Gilded milestone (species count) already announced. */
  gildedAnnounced?: number;
  /** Camp: challenges, embers, decorations, who stays there and your bond with them (see logic/camp). */
  camp?: import('./camp').CampState;
  /** The starter of your latest run (what friends see by your fire if you have no favourite). */
  lastStarter?: string;
  /** Your record with each line: times caught, run wins, MVPs and best level (see logic/dexInfo). */
  lines?: Record<string, import('./dexInfo').LineRecord>;
  /** Hexlidex completion rewards already claimed. */
  dexClaimed?: string[];
  /** Your fastest won run (active play time, ms). */
  fastestWin?: number;
}

/** One finished run, for the Records screen. */
export interface RunRecord {
  /** When it ended (ms since 1970). */
  at: number;
  won: boolean;
  /** Floor reached (1-3). */
  floor: number;
  mapId: string;
  heat: number;
  daily?: string;
  weekly?: string;
  battlesWon: number;
  caught: number;
  /** Who finished the run (survivors), up to 7. */
  team: { speciesId: string; stage: number; level: number; shiny?: boolean }[];
  mvp?: { speciesId: string; stage: number; name: string; dealt: number };
  endedBy?: string;
  /** Active play time (ms). */
  time?: number;
}

/** How many finished runs the Records screen keeps. */
export const HISTORY_MAX = 20;

/**
 * Note a finished run (called once, from the end screen): history, win streaks and which
 * Hexlings you use most. Stage battles (online) aren't counted.
 */
export function recordRun(run: Run, won: boolean) {
  const meta = run.meta;
  if (run.race) return;
  const mvp = runMvp(run);
  const rec: RunRecord = {
    at: Date.now(),
    won,
    floor: won ? 3 : run.floor + 1,
    mapId: run.mapId,
    heat: run.heat ?? 0,
    daily: run.daily,
    ...(run.weekly ? { weekly: run.weekly } : {}),
    battlesWon: run.log.battlesWon,
    caught: run.log.caught,
    team: allCreatures(run)
      .slice(0, 7)
      .map((c) => ({ speciesId: c.speciesId, stage: c.stage, level: c.level, ...(c.shiny ? { shiny: true } : {}) })),
    mvp: mvp && mvp.dealt > 0 ? { speciesId: mvp.speciesId, stage: mvp.stage, name: mvp.name, dealt: mvp.dealt } : undefined,
    endedBy: won ? undefined : run.log.endedBy?.label,
    ...(run.playMs ? { time: run.playMs } : {}),
  };
  noteRunRecord(meta, rec);
  meta.history = [rec, ...(meta.history ?? [])].slice(0, HISTORY_MAX);
  countRunResult(meta, won);
  const usage = (meta.usage = meta.usage ?? {});
  const ids = new Set([...allCreatures(run).map((c) => c.speciesId), ...(run.log.fallen ?? []).map((f) => f.speciesId)]);
  for (const id of ids) usage[id] = (usage[id] ?? 0) + 1;
  saveMeta(meta);
}

/** Does this species start runs shiny? (Caught shiny in any form, unless you've switched it off.) */
export function starterShiny(meta: Meta, speciesId: string): boolean {
  return (meta.shinyOwned ?? []).includes(speciesId) && !(meta.shinyOff ?? []).includes(speciesId);
}

/** Switch a shiny-unlocked starter between its shiny and normal colours. */
export function toggleStarterShiny(meta: Meta, speciesId: string) {
  const off = new Set(meta.shinyOff ?? []);
  if (off.has(speciesId)) off.delete(speciesId);
  else off.add(speciesId);
  meta.shinyOff = [...off];
  saveMeta(meta);
}

function withShiny(c: Creature, shiny: boolean): Creature {
  if (shiny) c.shiny = true;
  return c;
}

/** A shiny joined you: its species can now be brought shiny to the Arena and online duels. */
export function noteShinyOwned(meta: Meta, speciesId: string) {
  const owned = (meta.shinyOwned = meta.shinyOwned ?? []);
  if (!owned.includes(speciesId)) owned.push(speciesId);
  noteShiny(meta, speciesId);
}

/** A shiny was seen: remember its species for the Hexlidex. */
export function noteShiny(meta: Meta, speciesId: string) {
  const seen = (meta.shinySeen = meta.shinySeen ?? []);
  if (seen.includes(speciesId)) return;
  seen.push(speciesId);
  saveMeta(meta);
}

/** The species you've finished the most runs with. */
export function mostUsed(meta: Meta): { speciesId: string; runs: number } | null {
  const e = Object.entries(meta.usage ?? {}).sort((a, b) => b[1] - a[1])[0];
  return e ? { speciesId: e[0], runs: e[1] } : null;
}

export interface DailyResult {
  won: boolean;
  floor: number;
  battlesWon: number;
  score: number;
}

export interface DailyRecord {
  date: string;
  attempts: number;
  best: DailyResult | null;
}

const META_KEY = 'ccr-meta-v1';

export function loadMeta(): Meta {
  const fallback: Meta = {
    unlockedStarters: [...DEFAULT_STARTERS],
    unlockedPassives: ['mentor'],
    equippedPassive: null,
    runs: 0,
    wins: 0,
    dex: emptyDex(),
    coinsSpent: 0,
    bossesDefeated: 0,
    clearedMaps: [],
    lastMap: 'wildlands',
    stats: emptyStats(),
    achievements: [],
    newAchievements: [],
  };
  try {
    const raw = storage.getItem(META_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw);
    const meta: Meta = { ...fallback, ...saved, dex: { ...emptyDex(), ...(saved.dex ?? {}) }, stats: { ...emptyStats(), ...(saved.stats ?? {}) } };
    if (!saved.stats) meta.stats.caught = meta.dex.caught.length; // older saves: count known catches
    // Saves from before shinies were tracked per species: count the ones seen shiny as caught.
    if (!saved.shinyOwned && (saved.shinyCaught ?? 0) > 0) meta.shinyOwned = [...(saved.shinySeen ?? [])];
    checkAchievements(meta);
    lines(meta);
    // Saves from before titles had their own list: titles you already have aren't news.
    if (!saved.titlesAnnounced) meta.titlesAnnounced = earnedTitles(meta);
    // Saves from before NEW tags: what you already have isn't new.
    if (!saved.seenItems) meta.seenItems = unlockedExtras(meta).map((i) => itemId(i.key, i.value));
    if (!saved.seenTitles) meta.seenTitles = earnedTitles(meta);
    // v1.47: the run W/L starts over from your recent runs (online races had been counted as losses).
    if (!saved.runRecord) seedRunRecord(meta);
    return meta;
  } catch {
    return fallback;
  }
}

/** Set the run W/L and the win streak from your recent runs (newest first in history). */
export function seedRunRecord(meta: Meta) {
  const h = meta.history ?? [];
  meta.runRecord = { wins: h.filter((r) => r.won).length, losses: h.filter((r) => !r.won).length };
  let streak = 0;
  while (streak < h.length && h[streak].won) streak++;
  meta.streak = streak;
  meta.bestStreak = Math.max(meta.bestStreak ?? 0, streak);
}

/** Count a single-player run's result in the W/L (and the win streak). */
function countRunResult(meta: Meta, won: boolean) {
  const rr = (meta.runRecord ??= { wins: 0, losses: 0 });
  if (won) rr.wins += 1;
  else rr.losses += 1;
  meta.streak = won ? (meta.streak ?? 0) + 1 : 0;
  meta.bestStreak = Math.max(meta.bestStreak ?? 0, meta.streak);
}

/**
 * Give up the saved run (to start another): it counts as a loss, unless it was a Gilded Hunt
 * (its run was already won) or an online race. Then the save is cleared.
 */
export function abandonSavedRun(meta: Meta) {
  try {
    const raw = storage.getItem(RUN_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if (data && !data.hunt && !data.race) {
      countRunResult(meta, false);
      saveMeta(meta);
    }
  } catch {
    /* unreadable save: nothing to count */
  }
  clearSavedRun();
}

export function saveMeta(meta: Meta) {
  try {
    // Which version wrote this save (see saveVersion: older versions won't overwrite it).
    meta.savedBy = APP_VERSION;
    storage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* storage unavailable: progress just won't persist */
  }
}

// ---------------------------------------------------------------- run

export interface Run {
  rng: Rng;
  seed: number;
  meta: Meta;
  passive: PassiveId | null;
  floor: number;
  biomes: Element[];
  map: FloorMap;
  currentId: string;
  visited: string[];
  team: Creature[];
  bench: Creature[];
  evoStones: number;
  /** Stone count the player has already been shown (a rise triggers the "Evolution Stone!" reveal). */
  stonesSeen?: number;
  coins: number;
  /** Open shop at the current node, if any. */
  shop: Shop | null;
  /** Elements that already earned the post-Dex catch bonus this run. */
  claimedTypes: Element[];
  /** Lost to a boss but survived via the bench: must re-fight it. */
  bossPending: boolean;
  /**
   * Shiny Hunting: the endless climb after a won run. `depth` is the hunt floor (1, 2, ...); the run
   * stays on its last floor's tables (shops, XP, map shape) while enemies keep scaling with depth.
   */
  hunt?: { depth: number; shinies: number };
  log: {
    battlesWon: number;
    caught: number;
    lost: number;
    fights: number;
    /** Added later; older saves lack these. */
    coins?: number;
    fallen?: FallenRecord[];
    /** The fallen Hexlings themselves (from v1.48), for a Revival hex. */
    graveyard?: Creature[];
    /** What ended a lost run. */
    endedBy?: { label: string; speciesId: string; stage: number };
  };
  unlockedThisRun: string[];
  mapId: string;
  /** A node whose choice hasn't been made yet (so a reload re-offers it). */
  pendingNode: NodeKind | null;
  /** The battle in progress (or awaiting its reward choice). */
  activeBattle: ActiveBattle | null;
  /** The event on offer at the current node, if any. */
  eventId: string | null;
  /** Difficulty level of this run (0 = standard). */
  heat?: number;
  /** Set on a daily run: the UTC date it belongs to. */
  daily?: string;
  /** Set on a weekly challenge: the week (its Monday, UTC) and its twist rule. */
  weekly?: string;
  twist?: TwistId;
  /** Map: which side of your trainer your lead Hexling stands on (-1 left, 1 right). */
  followSide?: -1 | 1;
  /** Ascendant: the floor its free (no-sacrifice) prestige was used on. */
  ascendFloor?: number;
  /** Stage race against a friend: same map and seed, double battle rewards, a live duel at the end. */
  race?: {
    opponent: string;
    role: 'host' | 'guest';
    /** A battle royale (3-8 players, bracket at the end). */
    royale?: boolean;
    /** Your part is over (reached the boss, or your team fell): you watch the others on the map. */
    done?: { won: boolean; byDefault?: boolean };
  };
  /** Potions carried (usable any time, including mid-battle). */
  potions?: number;
  /** Held items not on any creature. */
  bag?: HeldId[];
  /** Held items gained since the map was last shown (each gets an announcement). */
  newItems?: HeldId[];
  /** Events already offered this run (so they don't repeat). */
  eventsSeen?: string[];
  /** The open treasure chest's contents, fixed once rolled. */
  treasure: import('./events').TreasureOffer | null;
  /** A legendary roaming this floor, on a battle hex ahead (see data/legends). */
  roamer?: { id: string; node: string; announced?: boolean } | null;
  /**
   * Your rival this run: a trainer with a team that grows each floor. They wait on one trainer
   * hex a floor (`node`), and `beaten` lists the floors you beat them on.
   */
  rival?: Rival | null;
  /** The choice made at camp before setting out ('skip' if none was taken). */
  prep?: import('./camp').PrepId | 'skip';
  /** Active play time so far (see logic/runClock), and when the run ended (its clock stops). */
  playMs?: number;
  endedAt?: number;
  /** Shops visited this run (the shopkeeper remembers you). */
  shopVisits?: number;
}

export interface Rival {
  name: string;
  /** Their lead Hexling's line, picked to have the edge on your starter. */
  ace: string;
  node: string | null;
  beaten: number[];
}

export interface ActiveBattle {
  /** A roaming legendary's battle: its id. */
  legend?: string;
  /** The battle against your rival. */
  rival?: boolean;
  kind: EncounterKind;
  enemies: Creature[];
  /** Opponent's name for trainer battles, e.g. "Ace Trainer Rhea". */
  trainer?: string;
  /** Wild battle won with the last creature left at 1 HP, awaiting catch or finish. */
  spared?: boolean;
  /** Win bookkeeping (XP, coins, burials) already done; only the reward choice remains. */
  settled: boolean;
  /** uids of your creatures that took part (full XP). */
  fought?: number[];
  summary: string;
  /** Which variant of the element's battle stage this fight takes place on. */
  stage?: number;
  /** Stat stages, who's out, the foe's potions left...: so a reload resumes the fight exactly. */
  state?: import('./battle').BattleState;
  /** Foe moves you've seen used in this fight ("team slot:moveId"), shown on its stats panel. */
  seenMoves?: string[];
}

/** Three starter choices: the favorite (if unlocked) plus random others from the unlocked pool. */
export function rollStarterChoices(meta: Meta, rng: Rng): string[] {
  const fav = meta.favorite && meta.unlockedStarters.includes(meta.favorite) ? meta.favorite : null;
  const others = rng.shuffle(meta.unlockedStarters.filter((id) => id !== fav));
  return fav ? [fav, ...others.slice(0, 2)] : others.slice(0, 3);
}

/** Favorite a line (or clear it by passing the current favorite). Only unlocked starters can be favorites. */
export function toggleFavorite(meta: Meta, speciesId: string): boolean {
  if (meta.favorite === speciesId) meta.favorite = undefined;
  else if (meta.unlockedStarters.includes(speciesId)) meta.favorite = speciesId;
  else return false;
  saveMeta(meta);
  return true;
}

// ---------------------------------------------------------------- daily run

/** Today's date in UTC (YYYY-MM-DD): everyone shares the same daily run. */
export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The run seed for a given day. */
export function dailySeed(date: string): number {
  return hashString(`daily:${date}`);
}

/** The day's three starters, drawn from the whole roster (unlocks don't matter). */
export function dailyStarters(date: string): string[] {
  return new Rng(hashString(`daily-starters:${date}`)).shuffle(SPECIES.map((s) => s.id)).slice(0, 3);
}

/** Score: a win beats any loss; then floors reached, then battles won. */
export function dailyScore(won: boolean, floor: number, battlesWon: number): number {
  return (won ? 10000 : floor * 1000) + battlesWon;
}

/** The record for one day's daily (created empty if that day hasn't been played). */
export function dailyRecord(meta: Meta, date: string): DailyRecord {
  meta.dailies = meta.dailies ?? {};
  // Carry over the single record older saves kept.
  if (meta.daily && !meta.dailies[meta.daily.date]) meta.dailies[meta.daily.date] = meta.daily;
  return (meta.dailies[date] = meta.dailies[date] ?? { date, attempts: 0, best: null });
}

/** Has this day's daily been played (and how did it go)? */
export function dailyPlayed(meta: Meta, date: string): DailyRecord | null {
  const rec = meta.dailies?.[date] ?? (meta.daily?.date === date ? meta.daily : undefined);
  return rec && rec.attempts > 0 ? rec : null;
}

/** Trainer passives that suit each element (for daily runs: each starter comes with one). */
export const ELEMENT_PASSIVES: Record<Element, PassiveId[]> = {
  Fire: ['drill', 'afflicter', 'coinpurse'],
  Frost: ['ironwill', 'tempered', 'bodyguard'],
  Nature: ['medic', 'naturalist', 'harmonist'],
  Earth: ['bodyguard', 'ironwill', 'trainer'],
  Storm: ['drill', 'afflicter', 'lucky'],
  Water: ['apothecary', 'medic', 'ironwill'],
  Metal: ['quartermaster', 'haggler', 'tempered'],
  Toxic: ['afflicter', 'tempered', 'apothecary'],
  Shadow: ['hunter', 'afflicter', 'lucky'],
  Light: ['medic', 'sage', 'explorer'],
  Spirit: ['sage', 'lucky', 'mentor'],
  Dragon: ['champion', 'evolutionist', 'drill'],
};

/**
 * The passive each of a day's starters comes with: one that suits its elements, the same for
 * everyone that day, and different for each of the three where possible.
 */
/** Online races: a passive for each starter on offer, from the race's seed (new every race). */
export function racePassives(seed: number, starters: string[]): Record<string, PassiveId> {
  return suitedPassives(starters, `race-passive:${seed}`);
}

export function dailyPassives(date: string): Record<string, PassiveId> {
  return suitedPassives(dailyStarters(date), `daily-passive:${date}`);
}

/** A passive for each starter that suits its elements, different for each where possible. */
function suitedPassives(starters: string[], salt: string): Record<string, PassiveId> {
  const out: Record<string, PassiveId> = {};
  const used = new Set<PassiveId>();
  for (const id of starters) {
    const [t1, t2] = SPECIES_BY_ID[id].types;
    // The main element's picks first, then the second element's.
    const pool = [...new Set([...ELEMENT_PASSIVES[t1], ...(t2 !== t1 ? ELEMENT_PASSIVES[t2] : [])])];
    const fresh = pool.filter((p) => !used.has(p));
    const from = fresh.length ? fresh : pool;
    const pick = from[hashString(`${salt}:${id}`) % from.length];
    used.add(pick);
    out[id] = pick;
  }
  return out;
}

// ---------------------------------------------------------------- weekly challenge

/** A weekly challenge's twist: one rule that changes the whole run. */
export type TwistId = 'duo' | 'swarm' | 'glass' | 'lean' | 'gilded';

export const TWISTS: Record<TwistId, { name: string; desc: string }> = {
  duo: { name: 'Element Duo', desc: 'Only two elements: every floor, wild Hexling, trainer and starter is one of them.' },
  swarm: { name: 'Swarm', desc: 'Every wild battle brings two Hexlings, from the very first.' },
  glass: { name: 'Glass Cannon', desc: 'Every Hexling, yours and theirs, deals 30% more damage.' },
  lean: { name: 'Lean Times', desc: 'Half the healing after battles, but 50% more coins.' },
  gilded: { name: 'Gilded Week', desc: 'One wild Hexling in 15 is Gilded. Catch them while you can!' },
};
/** One line about a week's twist (Element Duo names its elements). */
export function twistShort(info: WeeklyInfo): string {
  switch (info.twist) {
    case 'duo':
      return `Only ${info.duo![0]} and ${info.duo![1]} Hexlings this week`;
    case 'swarm':
      return 'Every wild battle brings two Hexlings';
    case 'glass':
      return 'Every Hexling deals +30% damage';
    case 'lean':
      return 'Half healing after battles · +50% coins';
    default:
      return 'One wild Hexling in 15 is Gilded';
  }
}

/** Glass Cannon: damage multiplier for both sides. */
export const GLASS_MULT = 1.3;

/** The twists in the order the weeks go through them. */
export const TWIST_ORDER: TwistId[] = ['duo', 'swarm', 'glass', 'lean', 'gilded'];

const DAY = 86400000;

/** The week a date falls in, named by its Monday (UTC, YYYY-MM-DD): everyone shares it. */
export function weekId(now = new Date()): string {
  const day = Math.floor(now.getTime() / DAY);
  // 1970-01-01 was a Thursday, so Mondays are the days where (day + 3) % 7 === 0.
  const monday = day - ((day + 3) % 7);
  return new Date(monday * DAY).toISOString().slice(0, 10);
}

/** Everything about a week's challenge: the same for everyone that week. */
export interface WeeklyInfo {
  week: string;
  seed: number;
  twist: TwistId;
  mapId: string;
  /** Element Duo: the two elements. */
  duo?: [Element, Element];
  starters: string[];
  passives: Record<string, PassiveId>;
}

export function weeklyInfo(week: string): WeeklyInfo {
  const index = Math.floor(Date.parse(`${week}T00:00:00Z`) / (7 * DAY));
  const twist = TWIST_ORDER[((index % TWIST_ORDER.length) + TWIST_ORDER.length) % TWIST_ORDER.length];
  const rng = new Rng(hashString(`weekly-setup:${week}`));
  let duo: [Element, Element] | undefined;
  let pool = SPECIES;
  let mapId = rng.pick(MAPS).id;
  if (twist === 'duo') {
    // Two elements with enough Hexlings between them for real choices.
    const els = rng.shuffle([...ELEMENTS]);
    duo = [els[0], els[1]];
    pool = SPECIES.filter((sp) => sp.types.some((t) => duo!.includes(t)));
    mapId = 'wildlands';
  }
  const starters = rng.shuffle(pool.map((sp) => sp.id)).slice(0, 3);
  return { week, seed: hashString(`weekly:${week}`), twist, mapId, duo, starters, passives: suitedPassives(starters, `weekly-passive:${week}`) };
}

/** The record for one week's challenge (created empty if it hasn't been played). */
export function weeklyRecord(meta: Meta, week: string): DailyRecord {
  meta.weeklies = meta.weeklies ?? {};
  return (meta.weeklies[week] = meta.weeklies[week] ?? { date: week, attempts: 0, best: null });
}

export function weeklyPlayed(meta: Meta, week: string): DailyRecord | null {
  const rec = meta.weeklies?.[week];
  return rec && rec.attempts > 0 ? rec : null;
}

/** Record a finished weekly challenge. Returns true if it's a new best for that week. */
export function recordWeekly(run: Run, won: boolean): boolean {
  if (!run.weekly) return false;
  const rec = weeklyRecord(run.meta, run.weekly);
  rec.attempts = Math.max(1, rec.attempts);
  const floor = won ? FLOORS : run.floor;
  const result: DailyResult = { won, floor, battlesWon: run.log.battlesWon, score: dailyScore(won, floor, run.log.battlesWon) };
  const better = !rec.best || result.score > rec.best.score;
  if (better) rec.best = result;
  saveMeta(run.meta);
  return better;
}

/** Start this week's challenge with one of its starters. */
export function startWeekly(meta: Meta, week: string, starterId: string): Run {
  const info = weeklyInfo(week);
  const run = startRun(meta, starterId, info.seed, info.mapId, undefined, true, week);
  if (info.duo) {
    const [a, b] = info.duo;
    run.biomes = [a, b, run.rng.pick([a, b])];
    run.map = generateFloor(0, run.biomes[0], run.rng.int(0, 2 ** 31));
    run.currentId = run.map.startId;
    run.visited = [run.map.startId];
  }
  return run;
}

/** A run's twist (weekly challenges only). */
export const twistOf = (run: Run): TwistId | null => run.twist ?? null;

/** Record a finished daily run. Returns true if it's a new best for that day. */
export function recordDaily(run: Run, won: boolean): boolean {
  const meta = run.meta;
  if (!run.daily) return false;
  const rec = dailyRecord(meta, run.daily);
  rec.attempts = Math.max(1, rec.attempts);
  const floor = won ? FLOORS : run.floor;
  const result: DailyResult = { won, floor, battlesWon: run.log.battlesWon, score: dailyScore(won, floor, run.log.battlesWon) };
  const better = !rec.best || result.score > rec.best.score;
  if (better) rec.best = result;
  meta.daily = rec;
  saveMeta(meta);
  return better;
}

/** Short description of a daily result. */
export function describeDaily(r: DailyResult): string {
  return r.won ? `Won! · ${r.battlesWon} battles` : `Floor ${r.floor + 1} · ${r.battlesWon} battles`;
}

/** `even`: Heat 0 and no passive of your own (daily runs and stage races, so everyone starts level).
 *  A daily run's starter brings the passive that day gives it (see dailyPassives). */
export function startRun(
  meta: Meta,
  starterId: string,
  seed = Date.now(),
  mapId = 'wildlands',
  daily?: string,
  even = !!daily,
  weekly?: string,
  /** Online races: the passive the seed gives this starter (the same for every player). */
  racePassive?: PassiveId | null,
): Run {
  const rng = new Rng(seed);
  const def = MAP_BY_ID[mapId] ?? MAP_BY_ID.wildlands;
  const biomes = def.biomes ? [...def.biomes] : rng.shuffle([...ELEMENTS]).slice(0, FLOORS);
  if (!daily && !weekly) meta.lastMap = def.id;
  const map = generateFloor(0, biomes[0], rng.int(0, 2 ** 31));
  // Online races have their own W/L (see addOnlineWin / addOnlineLoss), so they don't count here.
  if (racePassive === undefined) meta.runs += 1;
  if (daily) {
    const rec = dailyRecord(meta, daily);
    rec.attempts += 1;
    meta.daily = rec;
  }
  if (weekly) weeklyRecord(meta, weekly).attempts += 1;
  // Daily runs and races are the same for everyone: standard Heat, and no passive of your own
  // (a daily's starter comes with the passive the day gives it).
  const passive = daily
    ? (dailyPassives(daily)[starterId] ?? null)
    : weekly
      ? (weeklyInfo(weekly).passives[starterId] ?? null)
      : even
        ? (racePassive ?? null)
        : meta.equippedPassive;
  saveMeta(meta);
  const run: Run = {
    heat: even ? 0 : Math.min(meta.heat ?? 0, meta.heatUnlocked ?? 0),
    ...(daily ? { daily } : {}),
    ...(weekly ? { weekly, twist: weeklyInfo(weekly).twist } : {}),
    rng,
    seed,
    meta,
    passive,
    floor: 0,
    biomes,
    map,
    currentId: map.startId,
    visited: [map.startId],
    team: [withShiny(createCreature(starterId, passive === 'champion' ? 10 : BALANCE.starterLevel), starterShiny(meta, starterId))],
    bench: [],
    evoStones: passive === 'evolutionist' ? 1 : 0,
    stonesSeen: passive === 'evolutionist' ? 1 : 0,
    coins: passive === 'coinpurse' ? 50 : 0,
    potions: passive === 'apothecary' ? 2 : 0,
    bag: passive === 'quartermaster' ? [rollHeld(rng), rollHeld(rng)] : [],
    shop: null,
    claimedTypes: [],
    bossPending: false,
    log: { battlesWon: 0, caught: 0, lost: 0, fights: 0 },
    unlockedThisRun: [],
    mapId: def.id,
    pendingNode: null,
    activeBattle: null,
    eventId: null,
    treasure: null,
  };
  // The starter's nature comes from the run's seed (the same for everyone on a daily run).
  const starter = run.team[0];
  starter.nature = natureFor(`${seed}:starter`);
  starter.trait ??= rollTrait(starter.speciesId, `${seed}:starter`);
  starter.hp = stats(starter).hp;
  if (!daily && !weekly) meta.lastStarter = starterId;
  camp(meta);
  applyCampBond(run, starter);
  makeRival(run);
  applyFloorCap(run);
  return run;
}

/**
 * Set the level ceiling for the run's current floor. When it rises (new floor), XP your creatures
 * stored while held back pours in. Creatures already above it (older saves) keep their levels.
 */
export function applyFloorCap(run: Run) {
  // Shiny Hunting lifts the floor ceiling: your Hexlings can reach their own caps (up to 125).
  setFloorCeiling(run.hunt ? Infinity : (BALANCE.floorLevelCap[run.floor] ?? Infinity));
  // The land this floor is on: sometimes teaches your Hexlings one of its moves.
  setLand(run.biomes?.[run.floor] ?? run.map?.biome ?? null, (run.seed ?? 0) + run.floor);
  for (const c of allCreatures(run)) releaseBanked(c);
}

// ---------------------------------------------------------------- saving a run in progress

const RUN_KEY = 'ccr-run-v1';

/**
 * Persist the run so a reload resumes exactly here. Online runs (stage battles, battle royales)
 * are never saved: they can't be resumed without the other players, and the one save slot belongs
 * to your own run, which must survive playing online.
 */
export function saveRun(run: Run) {
  if (run.race) return;
  try {
    const { meta: _m, rng, ...rest } = run;
    void _m;
    storage.setItem(RUN_KEY, JSON.stringify({ ...rest, rngState: rng.getState() }));
  } catch {
    /* storage unavailable */
  }
}

export function hasSavedRun(): boolean {
  try {
    return !!storage.getItem(RUN_KEY);
  } catch {
    return false;
  }
}

export function loadRun(meta: Meta): Run | null {
  try {
    const raw = storage.getItem(RUN_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const rng = new Rng(0);
    rng.setState(data.rngState);
    delete data.rngState;
    const run = { ...data, rng, meta } as Run;
    const all = [...run.team, ...run.bench, ...(run.activeBattle?.enemies ?? [])];
    setNextUid(Math.max(0, ...all.map((c) => c.uid)) + 1);
    applyFloorCap(run);
    // Any shiny already in your party counts as owned (runs saved before that was tracked).
    for (const c of allCreatures(run)) if (c.shiny && !(meta.shinyOwned ?? []).includes(c.speciesId)) noteShinyOwned(meta, c.speciesId);
    return run;
  } catch {
    return null;
  }
}

/** Forget the saved run. Pass the run that's ending: an online run leaves your own saved run alone. */
export function clearSavedRun(ending?: Run | null) {
  if (ending?.race) return;
  try {
    storage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

/** Erase everything: the run in progress and all progress between runs. */
export function resetProgress() {
  try {
    storage.removeItem(RUN_KEY);
    storage.removeItem(META_KEY);
  } catch {
    /* ignore */
  }
}

export function unlockedMaps(meta: Meta) {
  return MAPS.filter((m) => mapUnlocked(m, meta.wins));
}

export function currentNode(run: Run): MapNode {
  return run.map.nodes[run.currentId];
}

export function canMoveTo(run: Run, id: string): boolean {
  return currentNode(run).next.includes(id);
}

export function moveTo(run: Run, id: string): MapNode {
  run.currentId = id;
  run.visited.push(id);
  // A roaming legendary wanders on as you move (unless you've just stepped onto its hex).
  if (run.roamer && run.roamer.node !== id) moveRoamer(run);
  return run.map.nodes[id];
}

// ---------------------------------------------------------------- roaming legendaries

/** Battle hexes still ahead of you (where a legendary can roam). */
function roamSpots(run: Run): string[] {
  const here = run.map.nodes[run.currentId];
  return Object.values(run.map.nodes)
    .filter((n) => n.kind === 'battle' && n.y < here.y - 1 && n.y > run.map.nodes[run.map.bossId].y + 1)
    .map((n) => n.id);
}

const roamable = (run: Run) => !run.daily && !run.weekly && !run.race && !run.hunt;

/** A new floor: now and then a legendary you haven't caught is roaming it (never the first floor). */
export function placeRoamer(run: Run, force = false) {
  run.roamer = null;
  if (!roamable(run) || run.floor < 1) return;
  if (!force && hashString(`${run.seed}:roam:${run.floor}`) % 1000 >= LEGEND_CHANCE * 1000) return;
  const left = LEGENDS.filter((l) => !run.meta.legends?.[l.id]?.caught);
  const spots = roamSpots(run);
  if (!left.length || !spots.length) return;
  const h = hashString(`${run.seed}:roamer:${run.floor}`);
  run.roamer = { id: left[h % left.length].id, node: spots[h % spots.length] };
}

/** Hexes between two map nodes (rows of pointy-top hexes: side neighbours are 2 columns apart). */
export function hexDistance(a: MapNode, b: MapNode): number {
  const dy = Math.abs(a.y - b.y);
  const dc = Math.abs(a.col - b.col);
  return dy + Math.max(0, (dc - dy) / 2);
}

/** How far a roaming legendary can jump each time you move. */
export const ROAM_JUMP = 2;

/**
 * The legendary hops 1 or 2 hexes to another battle hex ahead. If none is that close (you've
 * caught up with it), it slips to the nearest one; it leaves the floor when there's none.
 */
export function moveRoamer(run: Run) {
  if (!run.roamer) return;
  const from = run.map.nodes[run.roamer.node];
  const spots = roamSpots(run).filter((id) => id !== run.roamer!.node);
  if (!spots.length || !from) {
    run.roamer = null;
    return;
  }
  const dist = (id: string) => hexDistance(from, run.map.nodes[id]);
  const near = spots.filter((id) => dist(id) <= ROAM_JUMP);
  const closest = Math.min(...spots.map(dist));
  const pool = near.length ? near : spots.filter((id) => dist(id) === closest);
  run.roamer.node = pool[hashString(`${run.seed}:roam:${run.floor}:${run.visited.length}`) % pool.length];
}

/**
 * The legendary as you meet it: alone, at your strongest Hexling's level (its stats do the rest),
 * with the health it had left. It's here to test you, not to finish you: it hits softer (see
 * LEGEND_DAMAGE) and slips away after a few turns.
 */
export function legendFoe(run: Run, id: string): Creature {
  const c = createCreature(id, highestLevel(run) + heatRules(run.heat ?? 0, run.floor).enemyLevels, 2);
  const rec = (run.meta.legends ??= {})[id] ?? { hp: 1 };
  run.meta.legends[id] = { ...rec, met: (rec.met ?? 0) + 1 };
  c.hp = Math.max(1, Math.round(stats(c).hp * Math.max(0.1, Math.min(1, rec.hp))));
  saveMeta(run.meta);
  return c;
}

/** It fled (or you lost): it keeps the damage you did, and roams on. */
export function legendFled(run: Run, foe: Creature) {
  const rec = (run.meta.legends ??= {})[foe.speciesId] ?? { hp: 1 };
  rec.hp = Math.max(0.1, foe.hp / stats(foe).hp);
  run.meta.legends[foe.speciesId] = rec;
  saveMeta(run.meta);
  if (run.roamer?.id === foe.speciesId) moveRoamer(run);
}

/** Beaten: it leaves this run, and comes back another day only partly recovered (unless caught). */
export function legendBeaten(run: Run, id: string) {
  const rec = (run.meta.legends ??= {})[id] ?? { hp: 1 };
  if (!rec.caught) rec.hp = LEGEND_RECOVER;
  run.meta.legends[id] = rec;
  if (run.roamer?.id === id) run.roamer = null;
  saveMeta(run.meta);
}

export const legendsCaught = (meta: Meta): number => LEGENDS.filter((l) => meta.legends?.[l.id]?.caught).length;

export function allCreatures(run: Run): Creature[] {
  return [...run.team, ...run.bench];
}

export function highestLevel(run: Run): number {
  return Math.max(1, ...allCreatures(run).map((c) => c.level));
}

/** A creature lost during the run, remembered for the summary. */
export interface FallenRecord {
  /** The fallen Hexling's uid (from v1.48), to match it if it's revived. */
  uid?: number;
  speciesId: string;
  stage: number;
  level: number;
  name: string;
  dealt: number;
  kos: number;
}

/** The creature that did the most damage this run, alive or fallen. */
export function runMvp(run: Run): { speciesId: string; stage: number; level: number; name: string; dealt: number; kos: number; fallen: boolean } | null {
  const all = [
    ...allCreatures(run).map((c) => ({ speciesId: c.speciesId, stage: c.stage, level: c.level, name: creatureName(c), dealt: c.dealt ?? 0, kos: c.kos ?? 0, fallen: false })),
    ...(run.log.fallen ?? []).map((f) => ({ ...f, fallen: true })),
  ];
  if (!all.length) return null;
  return all.reduce((a, b) => (b.dealt > a.dealt ? b : a));
}

/** Survivors catch their breath after a win. */
/** The strongest value of a trait among these Hexlings (0 if none has it). */
export function teamTrait(list: Creature[], id: TraitId): number {
  let v = 0;
  for (const c of list) if (isAlive(c) && traitOf(c) === id) v = Math.max(v, traitValue(c, id));
  return v;
}

export function postBattleRecover(run: Run) {
  const frac =
    (run.passive === 'ironwill' ? BALANCE.ironWillHeal : BALANCE.postBattleHeal) * heatRules(run.heat ?? 0).healMult * (run.twist === 'lean' ? 0.5 : 1);
  // Healer's Touch: the whole team heals a little more; Forager: it heals itself a little more.
  const touch = teamTrait(run.team, 'healtouch');
  for (const c of run.team) {
    if (!isAlive(c)) continue;
    const forage = traitOf(c) === 'forager' ? traitValue(c, 'forager') : 0;
    c.hp = Math.min(stats(c).hp, c.hp + Math.ceil(stats(c).hp * (frac + touch + forage)));
  }
  // Resting on the bench restores some move uses.
  for (const c of run.bench) restoreUses(c, BALANCE.benchUseRestore);
}

/** Remove fainted creatures (permadeath). Returns their names. */
export function buryFallen(run: Run): string[] {
  const fallen = run.team.filter((c) => !isAlive(c));
  // Their items are recovered.
  for (const c of fallen) unequipHeld(run, c);
  run.team = run.team.filter(isAlive);
  run.log.lost += fallen.length;
  run.log.fallen = [
    ...(run.log.fallen ?? []),
    ...fallen.map((c) => ({ uid: c.uid, speciesId: c.speciesId, stage: c.stage, level: c.level, name: creatureName(c), dealt: c.dealt ?? 0, kos: c.kos ?? 0 })),
  ];
  run.log.graveyard = [...(run.log.graveyard ?? []), ...fallen.map((c) => JSON.parse(JSON.stringify(c)) as Creature)];
  return fallen.map(creatureName);
}

/** A revived Hexling comes back at this share of the level it fell at. */
export const REVIVE_LEVEL = 0.6;

/** The level a fallen Hexling comes back at. */
export const reviveLevel = (c: Pick<Creature, 'level'>) => Math.max(1, Math.round(c.level * REVIVE_LEVEL));

/** What a fallen Hexling would be like revived (full health, fresh moves, 60% of its level). */
export function revivedForm(c: Creature): Creature {
  const r = JSON.parse(JSON.stringify(c)) as Creature;
  r.level = reviveLevel(c);
  r.xp = 0;
  r.banked = 0;
  r.status = undefined;
  r.held = undefined;
  restoreUses(r);
  r.hp = stats(r).hp;
  return r;
}

/** Revival hex: bring a fallen Hexling back (team if there's room, else the bench). */
export function reviveFallen(run: Run, uid: number): Creature | null {
  const grave = run.log.graveyard ?? [];
  const i = grave.findIndex((c) => c.uid === uid);
  if (i < 0 || rosterFull(run)) return null;
  const c = revivedForm(grave[i]);
  grave.splice(i, 1);
  // It's no longer among the fallen in the run summary.
  const f = (run.log.fallen ?? []).findIndex((x) => x.uid === uid);
  if (f >= 0) run.log.fallen!.splice(f, 1);
  if (run.team.length < TEAM_MAX) run.team.push(c);
  else run.bench.push(c);
  return c;
}

/** Fill empty main-team slots from the front of the bench. Returns who stepped up. */
export function fillTeamFromBench(run: Run): Creature[] {
  const moved: Creature[] = [];
  while (run.team.length < TEAM_MAX && run.bench.length) {
    const c = run.bench.shift()!;
    run.team.push(c);
    moved.push(c);
  }
  return moved;
}

/** Main team wiped: bench becomes the team. Returns false if the run is over. */
export function promoteBench(run: Run): boolean {
  buryFallen(run);
  if (run.bench.length === 0) return false;
  run.team = run.bench.splice(0, TEAM_MAX);
  if (run.passive === 'bodyguard') for (const c of run.team) c.hp = stats(c).hp;
  trackStat(run, 'wipes');
  return true;
}

// ---------------------------------------------------------------- enemies

export type EncounterKind = 'battle' | 'elite' | 'boss';

/**
 * Enemies on later floors are prestiged to match your team, so stars don't simply outclass them:
 * your main team's average stars (wild: same or one less, trainers: same, guardians: same plus
 * BALANCE.bossStarBonus), capped per floor by BALANCE.enemyStarMax.
 */
export function enemyStars(run: Run, kind: EncounterKind, rng: Rng): number {
  if (run.hunt) {
    // Shiny Hunting: enemies out-prestige you as you go deeper, up to 6 stars (one past yours).
    const d = run.hunt.depth;
    const n = 2 + Math.floor((d - 1) / 2) + (kind === 'boss' ? 1 : kind === 'battle' ? rng.int(-1, 0) : 0);
    return Math.max(0, Math.min(HUNT_MAX_STARS, n));
  }
  const max = BALANCE.enemyStarMax[run.floor] ?? 0;
  if (!max || !run.team.length) return 0;
  const avg = Math.round(run.team.reduce((t, c) => t + c.stars, 0) / run.team.length);
  const n = avg + (kind === 'boss' ? BALANCE.bossStarBonus : kind === 'battle' ? rng.int(-1, 0) : 0);
  return Math.max(0, Math.min(max, n));
}

/**
 * Randomness tied to a place: the same seed, floor and hex give the same result, whatever happened
 * before (so everyone on a shared seed meets the same Hexlings, trainers, shops and events).
 */
export function placeRng(run: Run, tag: string, node: string = run.currentId): Rng {
  return new Rng(hashString(`${run.seed}:${run.floor}:${node}:${tag}`));
}

const eventRngs = new WeakMap<Run, { key: string; rng: Rng }>();
/** One stream of randomness per hex for events (several draws as an event plays out). */
export function eventRng(run: Run): Rng {
  const key = `${run.floor}:${run.currentId}`;
  const cur = eventRngs.get(run);
  if (cur?.key === key) return cur.rng;
  const rng = placeRng(run, 'event');
  eventRngs.set(run, { key, rng });
  return rng;
}

/** A floor's layout, from the seed alone. */
const floorSeed = (run: Run) => hashString(`${run.seed}:floor:${run.floor}`);

/** Which Hexlings the i-th foe of an encounter is picked from (uses the encounter's random stream). */
function encounterPool(run: Run, kind: EncounterKind, i: number, count: number, rng: Rng, duoPool: Species[] | null): Species[] {
  const biome = run.biomes[run.floor];
  const boss = kind === 'boss' ? BOSSES[biome] : null;
  let pool = rng.chance(0.7) ? speciesWithElement(biome) : (duoPool ?? SPECIES);
  // At night (by your clock), Shadow and Spirit Hexlings come out in every land (unseeded runs).
  if (kind === 'battle' && roamable(run) && run.log.fights > 0 && nightOut() && rng.chance(NIGHT_SHARE)) {
    pool = SPECIES.filter((sp) => sp.types.includes('Shadow') || sp.types.includes('Spirit'));
  }
  if (boss) {
    // Guardians field a themed team; their ace pairs the boss element with its partner.
    const own = speciesWithElement(biome);
    const ace = own.filter((sp) => sp.types.includes(boss.partner));
    pool = i === count - 1 && ace.length ? ace : own;
  }
  // The run's first battle is always a neutral matchup with your starter.
  if (!boss && run.log.fights === 0 && run.team[0]) pool = fairPool(pool, creatureTypes(run.team[0]), neutralMatchup, duoPool ?? SPECIES);
  return pool;
}

function encounterCount(run: Run, kind: EncounterKind, rng: Rng): number {
  const f = run.floor;
  return kind === 'boss' || kind === 'elite' ? (f === 0 ? 2 : 3) : run.twist === 'swarm' ? 2 : f === 0 ? 1 : rng.chance(0.5) ? 2 : 1;
}

/**
 * Scout: who's waiting on a battle hex (its first Hexling, and how many in all), without
 * touching the run. Matches makeEncounter for the next fight.
 */
export function peekEncounter(run: Run, node: MapNode): { speciesId: string; count: number } | null {
  if (node.kind !== 'battle' && node.kind !== 'elite') return null;
  if (node.kind === 'battle' && run.roamer && run.roamer.node === node.id) return { speciesId: run.roamer.id, count: 1 };
  const kind = node.kind as EncounterKind;
  const rng = placeRng(run, 'encounter', node.id);
  const count = encounterCount(run, kind, rng);
  const duo = run.twist === 'duo' && run.weekly ? weeklyInfo(run.weekly).duo : undefined;
  const duoPool = duo ? SPECIES.filter((sp) => sp.types.some((t) => duo.includes(t))) : null;
  return { speciesId: rng.pick(encounterPool(run, kind, 0, count, rng, duoPool)).id, count };
}

/** Scout: how far ahead its owner can see (0: no Scout on the team). */
export const scoutRange = (run: Run): number => teamTrait(run.team, 'scout');

export function makeEncounter(run: Run, node: MapNode): Creature[] {
  const kind = node.kind as EncounterKind;
  const rng = placeRng(run, 'encounter', node.id);
  if (kind === 'battle' && run.roamer && run.roamer.node === node.id) {
    run.log.fights += 1;
    return [legendFoe(run, run.roamer.id)];
  }
  const f = run.floor;
  const biome = run.biomes[f];
  const count = encounterCount(run, kind, rng);
  // Element Duo (weekly): everything is one of the week's two elements.
  const duo = run.twist === 'duo' && run.weekly ? weeklyInfo(run.weekly).duo : undefined;
  const duoPool = duo ? SPECIES.filter((sp) => sp.types.some((t) => duo.includes(t))) : null;

  const enemies: Creature[] = [];
  const boss = kind === 'boss' ? BOSSES[biome] : null;
  const heat = heatRules(run.heat ?? 0, f);
  for (let i = 0; i < count; i++) {
    const sp = rng.pick(encounterPool(run, kind, i, count, rng, duoPool));
    let level = BALANCE.floorBaseLevel[f] + Math.round(Math.pow(node.progress, BALANCE.rampCurve) * BALANCE.floorRamp[f]) + rng.int(-1, f === 0 ? 0 : 1);
    let stage = f;
    level += heat.enemyLevels;
    if (kind === 'elite') level += BALANCE.eliteLevelBonus + heat.eliteLevels;
    if (kind === 'boss') {
      // Extra rules at Heat 4+ come with a few levels off, to keep the fight fair.
      level = BALANCE.bossLevel[f] + (i === count - 1 ? 2 : 0) + heat.enemyLevels + heat.bossLevels - extraRuleCount(run.heat ?? 0) * EXTRA_RULE_LEVELS;
      stage = Math.min(2, f + (i === count - 1 && BALANCE.bossLeadEvolves[f] ? 1 : 0));
    }
    if (run.hunt) {
      // Shiny Hunting: final forms from the start, and levels that climb past yours.
      level = huntLevel(run.hunt.depth, node.progress, kind) + (kind === 'boss' && i === count - 1 ? 2 : 0) + rng.int(-1, 1);
      stage = 2;
    }
    const c = createCreature(sp.id, Math.max(1, level), stage);
    c.stars = enemyStars(run, kind, rng);
    // A hash, like shininess, so the run's random rolls are untouched.
    c.nature = natureFor(`${run.seed}:${run.hunt?.depth ?? 0}:${run.log.fights}:${i}`);
    c.trait = rollTrait(c.speciesId, `${run.seed}:${run.hunt?.depth ?? 0}:${run.log.fights}:${i}`);
    if (kind !== 'battle' && f > 0) {
      for (const m of c.moves) if (rng.chance(0.4)) m.tier = 2;
    }
    if (kind === 'boss' && f === 2) for (const m of c.moves) m.tier = Math.max(m.tier, 2);
    // Guardians from floor 2 (and some floor 3 trainers) use their team move in place of a stat move.
    if ((kind === 'boss' && f > 0) || (kind === 'elite' && f === 2 && rng.chance(0.5))) giveTeamMove(c);
    // Trainers and guardians carry held items (the guardian's ace always, trainers sometimes from floor 2).
    const holds = boss ? i === count - 1 || heat.bossTeamItems : kind === 'elite' && (heat.eliteItems || (f > 0 && rng.chance(0.4)));
    if (holds) c.held = rollHeld(rng);
    // About 1 wild Hexling in 200 is shiny (a hash, so the run's random rolls are untouched).
    // Shiny Hunting: far more often, and trainers' and guardians' Hexlings can be shiny too.
    const odds = run.hunt
      ? huntShinyIn(run.heat ?? 0)[kind === 'battle' ? 'wild' : 'trainer']
      : kind === 'battle' ? (run.twist === 'gilded' ? GILDED_WEEK_IN : SHINY_IN) : 0;
    const roll = hashString(`${run.seed}:shiny:${run.hunt?.depth ?? 0}:${run.log.fights}:${i}`);
    // (Hunt odds can be fractional with Heat: 1 in 10.5 and so on.)
    // Gilded Charm: Gilded Hexlings turn up more often (x1.5, final form x2).
    const charm = 1 + teamTrait(run.team, 'gilded') * 0.5;
    if (odds && (run.hunt ? roll % 100000 < (100000 * charm) / odds : roll % Math.max(1, Math.round(odds / charm)) === 0)) c.shiny = true;
    c.hp = stats(c).hp;
    enemies.push(c);
  }
  run.log.fights += 1;
  // Your rival: their own team instead, led by their ace.
  if (kind === 'elite' && rivalHere(run, node.id)) return rivalTeam(run, enemies);
  return enemies;
}

/** One wild Hexling in this many is shiny. */
export const SHINY_IN = 200;
/** Gilded Week (a weekly twist): one wild Hexling in this many is shiny. */
export const GILDED_WEEK_IN = 15;
/** Shiny Hunting: one in this many wild Hexlings, and trainers' / guardians' Hexlings, is shiny. */
export const HUNT_SHINY_IN = { wild: 12, trainer: 20 };

/**
 * Gilded odds on a Gilded Hunt ("1 in N"): each Heat adds another chance, so wild Hexlings go
 * 1 in 12 → 5 in 12 at Heat 4 → 9 in 12 at Heat 8 (trainers' 1 in 20 → 9 in 20).
 */
export function huntShinyIn(heat: number): { wild: number; trainer: number } {
  const chances = 1 + Math.max(0, Math.min(MAX_HEAT, Math.floor(heat)));
  return { wild: HUNT_SHINY_IN.wild / chances, trainer: HUNT_SHINY_IN.trainer / chances };
}

/** Note how deep a hunt got: deeper is better, and at the same depth a higher Heat. */
export function noteHunt(meta: Meta, depth: number, heat: number) {
  const best = meta.bestHunt ?? 0;
  if (depth > best || (depth === best && heat > (meta.bestHuntHeat ?? 0))) {
    meta.bestHunt = depth;
    meta.bestHuntHeat = heat;
  }
}
/** Shiny Hunting enemies can carry one more star than yours can. */
export const HUNT_MAX_STARS = 6;

/**
 * Enemy level on a Shiny Hunting floor: final-form levels from the start (around the floor 3
 * guardian), climbing 8 a floor, past your 125 cap from around the 4th hunt floor.
 */
export function huntLevel(depth: number, progress: number, kind: EncounterKind): number {
  const base = 94 + (depth - 1) * 8 + Math.round(progress * 10);
  return base + (kind === 'elite' ? 3 : kind === 'boss' ? 8 : 0);
}

/**
 * Start Shiny Hunting after a won run: the team is fully healed and restored, and the climb goes on
 * through endless floors of random elements. Returns the new floor's element.
 */
export function startHunt(run: Run): Element {
  run.hunt = { depth: 1, shinies: 0 };
  for (const c of allCreatures(run)) {
    c.hp = stats(c).hp;
    cureStatus(c);
    restoreUses(c);
  }
  return nextHuntFloor(run);
}

/** A new Shiny Hunting floor: a random element and a fresh map (on the last floor's shape). */
function nextHuntFloor(run: Run): Element {
  const el = run.rng.pick([...ELEMENTS]);
  run.biomes[run.floor] = el;
  applyFloorCap(run);
  run.map = generateFloor(run.floor, el, run.rng.int(0, 2 ** 31));
  run.currentId = run.map.startId;
  run.visited = [run.map.startId];
  run.bossPending = false;
  run.shop = null;
  run.pendingNode = null;
  return el;
}

/** Swap a creature's first stat move (or its last move) for its line's team move. */
function giveTeamMove(c: Creature) {
  const id = teamMoveId(teamElement(SPECIES_BY_ID[c.speciesId]));
  if (c.moves.some((m) => m.id === id)) return;
  if (c.moves.length < MAX_MOVES) return void c.moves.push({ id, tier: 1 });
  const i = c.moves.findIndex((m) => MOVES[m.id].kind === 'buff' || MOVES[m.id].kind === 'debuff');
  c.moves[i >= 0 ? i : c.moves.length - 1] = { id, tier: 1 };
}

// Early-game fairness filters (lead = types of your first creature).
const near1 = (m: number) => Math.abs(m - 1) < 0.02;

/** Enemy has no type advantage over your lead. */
export function noAdvantageOver(sp: Species, lead: TypePair): boolean {
  return sp.types.every((t) => typeMultiplier(t, lead) <= 1.01);
}

/** Neither side has an advantage or disadvantage: enemy attacks neutral on your lead, and yours neutral on it. */
export function neutralMatchup(sp: Species, lead: TypePair): boolean {
  return sp.types.every((t) => near1(typeMultiplier(t, lead))) && lead.every((t) => near1(typeMultiplier(t, sp.types)));
}

/** Filter a spawn pool, widening to every species (then to "no advantage") if nothing fits. */
function fairPool(pool: Species[], lead: TypePair, test: (sp: Species, lead: TypePair) => boolean, all: Species[] = SPECIES): Species[] {
  const a = pool.filter((sp) => test(sp, lead));
  if (a.length) return a;
  const b = all.filter((sp) => test(sp, lead));
  if (b.length) return b;
  const c = all.filter((sp) => noAdvantageOver(sp, lead));
  return c.length ? c : pool;
}

// ---------------------------------------------------------------- rewards

export interface XpResult {
  name: string;
  xp: number;
  levels: number;
  /** XP stored at the level cap. */
  banked: number;
  /** Coins the capped creature turned XP into. */
  coins: number;
  /** At the cap with a full store. */
  full: boolean;
}

/** Give one creature XP; at the cap it's stored and part of it paid out as coins. */
function giveXp(run: Run, c: Creature, xp: number): XpResult {
  const g = gainXp(c, xp);
  const capped = g.banked + g.overflow;
  const level = xpToNext(c.level);
  const coins = Math.round((g.banked * BALANCE.capCoinsPerLevel + g.overflow * BALANCE.fullBankCoinsPerLevel) / level);
  if (coins > 0) earnCoins(run, coins);
  return { name: creatureName(c), xp, levels: g.levels, banked: g.banked, coins, full: capped > 0 && (c.banked ?? 0) >= bankLimit(c) };
}

export function battleCoins(enemies: Creature[], kind: EncounterKind, heat = 0, twist: TwistId | null = null): number {
  const mult = (kind === 'boss' ? 3 : kind === 'elite' ? BALANCE.trainerCoinMult : 1) * heatRules(heat).coinMult * (twist === 'lean' ? 1.5 : 1);
  return Math.round(enemies.reduce((s, e) => s + BALANCE.coinsBase + e.level * BALANCE.coinsPerEnemyLevel, 0) * mult);
}

export function battleXp(enemies: Creature[], kind: EncounterKind, floor = 0): number {
  const mult = kind === 'boss' ? 2 : kind === 'elite' ? BALANCE.trainerXpMult : 1;
  return Math.round(enemies.reduce((s, e) => s + xpToNext(e.level) * BALANCE.xpYield[floor], 0) * mult);
}

/**
 * Creatures that fought (uids in `fought`) get full XP; teammates who sat out and the bench get a share.
 * Catch-up is capped at x2, so a creature that sat out can at most match the fighters.
 */
export function grantXp(run: Run, amount: number, fought?: number[]): XpResult[] {
  const top = highestLevel(run);
  // Mentor's Aura: the bench learns more from watching.
  const benchShare = (run.passive === 'mentor' ? 1 : BALANCE.benchXpShare) * (1 + teamTrait(run.team, 'mentor'));
  const out: XpResult[] = [];
  for (const c of run.team) {
    const share = !fought || fought.includes(c.uid) ? 1 : BALANCE.sideXpShare;
    const xp = Math.round(amount * share * catchUpMultiplier(c.level, top) * eggMult(c));
    out.push(giveXp(run, c, xp));
  }
  for (const c of run.bench) {
    const xp = Math.round(amount * benchShare * catchUpMultiplier(c.level, top) * eggMult(c));
    out.push(giveXp(run, c, xp));
  }
  return out;
}

/** How many potions this run can carry, and how much each heals. */
export const maxPotions = (run: Run) => (run.passive === 'apothecary' ? 8 : 5);

/** Take the choice offered at camp before setting out. */
export function applyPrep(run: Run, id: PrepId | 'skip') {
  run.prep = id;
  const prepRng = new Rng(hashString(`${run.seed}:prep:take`));
  if (id === 'purse') run.coins += 60;
  if (id === 'potions') run.potions = Math.min(maxPotions(run), (run.potions ?? 0) + 2);
  if (id === 'held') (run.bag ??= []).push(rollHeld(prepRng));
  if (id === 'stone') {
    run.evoStones += 1;
    run.stonesSeen = (run.stonesSeen ?? 0) + 1;
  }
  if (id === 'charm' && run.team[0]) run.team[0].bond = Math.max(run.team[0].bond ?? 0, CAMP_START_BOND);
  saveRun(run);
}
export const potionHeal = (run: Run) => (run.passive === 'apothecary' ? 0.75 : 0.5);

/** A potion helps a living creature that's hurt or has a status condition. */
export const needsPotion = (c: Creature) => isAlive(c) && (c.hp < stats(c).hp || !!c.status);

/** Count a potion drunk (for the Chemist achievement). */
export function notePotion(run: Run) {
  trackStat(run, 'potionsUsed');
}

/** Drink a carried potion. Returns false if there's none or it wouldn't help. */
export function usePotion(run: Run, c: Creature): boolean {
  if ((run.potions ?? 0) < 1 || !needsPotion(c)) return false;
  run.potions! -= 1;
  healFraction(c, potionHeal(run));
  c.status = undefined;
  notePotion(run);
  return true;
}

const eggMult = (c: Creature) => (c.held === 'egg' ? 1.4 : 1);

/** A random held item, weighted by rarity. */
export function rollHeld(rng: Rng): HeldId {
  return rng.weighted(Object.fromEntries(HELD_IDS.map((id) => [id, HELD[id].weight])) as Record<HeldId, number>);
}

/** Put an item in the bag. */
/** Put an item in the bag. `fresh` items (newly earned, not returned) get announced on the map. */
export function stash(run: Run, id: HeldId, fresh = true) {
  run.bag = [...(run.bag ?? []), id];
  if (fresh) run.newItems = [...(run.newItems ?? []), id];
}

/** Give a bag item to a creature; whatever it held goes back in the bag. */
export function equipHeld(run: Run, c: Creature, id: HeldId) {
  const bag = [...(run.bag ?? [])];
  const at = bag.indexOf(id);
  if (at < 0) return;
  bag.splice(at, 1);
  if (c.held) bag.push(c.held);
  c.held = id;
  run.bag = bag;
  trackStat(run, 'heldEquipped');
}

/** Take a creature's item back into the bag. */
export function unequipHeld(run: Run, c: Creature) {
  if (!c.held) return;
  stash(run, c.held, false);
  c.held = undefined;
}

export function rosterFull(run: Run): boolean {
  return run.team.length >= TEAM_MAX && run.bench.length >= BENCH_MAX;
}

/**
 * Add a creature to the party. With `release`, that creature leaves for good (its item goes back
 * to the bag) and the newcomer takes its exact spot.
 */
function addToParty(run: Run, c: Creature, release?: Creature) {
  const list = release ? (run.team.includes(release) ? run.team : run.bench.includes(release) ? run.bench : null) : null;
  if (release && list) {
    unequipHeld(run, release);
    list[list.indexOf(release)] = c;
  } else if (run.team.length < TEAM_MAX) run.team.push(c);
  else run.bench.push(c);
  registerJoin(run, c);
}

/** Room for one more, either free or by releasing someone. */
export const canMakeRoom = (run: Run, release?: Creature) => !rosterFull(run) || (!!release && allCreatures(run).includes(release));

/** Every regular line caught (the catch bonus turns per element). Legendaries aren't needed for this. */
export function dexComplete(run: Run): boolean {
  return SPECIES.every((s) => run.meta.dex.caught.includes(s.id));
}

/**
 * Which catch bonus (a free ★) this species would earn right now:
 * - 'species': first time ever catching it (while the Dex is incomplete)
 * - 'type': Dex complete, and at least one of its elements hasn't earned the bonus yet this run
 */
export type CatchBonus = 'species' | 'type' | null;

export function catchBonus(run: Run, speciesId: string): CatchBonus {
  if (!dexComplete(run)) return run.meta.dex.caught.includes(speciesId) ? null : 'species';
  const types = SPECIES_BY_ID[speciesId].types;
  return types.every((t) => run.claimedTypes.includes(t)) ? null : 'type';
}

/** Elements that can still earn the type bonus this run (only meaningful once the Dex is complete). */
export function unclaimedTypes(run: Run): Element[] {
  return ELEMENTS.filter((e) => !run.claimedTypes.includes(e));
}

/** Catch: forfeit rewards, add a raw copy of the species. May arrive with a free ★ (see catchBonus). */
/** Scout passive: extra levels for caught creatures. */
export const SCOUT_BONUS_LEVELS = 3;

/** The level a caught creature joins at: its own level (+3 with Scout), within its level cap. */
export function catchLevel(run: Run, enemy: Creature): number {
  const stars = catchStars(run, enemy);
  const bonus = run.passive === 'scout' ? SCOUT_BONUS_LEVELS : 0;
  // Catcher: catches made while it leads join a level or two higher.
  const lead = run.team.find(isAlive);
  const catcher = lead && traitOf(lead) === 'catcher' ? traitValue(lead, 'catcher') : 0;
  return Math.min(stageCap({ stage: enemy.stage, stars }), enemy.level + bonus + catcher);
}

/** Stars a catch joins with: the ones it had in battle, +1 for a first-catch or type bonus (max 5). */
export function catchStars(run: Run, enemy: Creature): number {
  return Math.min(MAX_STARS, (enemy.stars ?? 0) + (catchBonus(run, enemy.speciesId) ? 1 : 0));
}

export function catchCreature(
  run: Run,
  enemy: Creature,
  release?: Creature,
): { c: Creature; bonus: CatchBonus; newlyClaimed: Element[] } | null {
  if (!canMakeRoom(run, release)) return null;
  // It joins as it was in battle: same level, evolution and moves, still recovering (partial HP).
  const level = catchLevel(run, enemy);
  const bonus = catchBonus(run, enemy.speciesId);
  const c = createCreature(enemy.speciesId, level, enemy.stage);
  c.moves = enemy.moves.map((m) => ({ ...m }));
  c.learnIndex = enemy.learnIndex;
  c.pendingMoves = [];
  c.stars = catchStars(run, enemy);
  c.nature = enemy.nature;
  c.trait = enemy.trait;
  c.hp = Math.max(1, Math.round(stats(c).hp * BALANCE.catchHp));
  if (enemy.shiny) {
    c.shiny = true;
    noteShinyOwned(run.meta, c.speciesId);
    run.meta.shinyCaught = (run.meta.shinyCaught ?? 0) + 1;
    if (run.hunt) run.hunt.shinies += 1;
  }
  const newlyClaimed: Element[] = [];
  if (bonus === 'type')
    for (const t of creatureTypes(c))
      if (!run.claimedTypes.includes(t)) {
        run.claimedTypes.push(t);
        newlyClaimed.push(t);
      }
  addToParty(run, c, release);
  run.log.caught += 1;
  track(run.meta, 'caught');
  noteCatch(run.meta, c.speciesId);
  saveMeta(run.meta);
  return { c, bonus, newlyClaimed };
}

/** Levels above its own that a claimed guardian joins at. */
export const GUARDIAN_BONUS_LEVELS = 5;

/**
 * The level a claimed guardian joins at: its own level +5, within its stage cap and the next
 * floor's level ceiling (it's claimed as you climb to that floor).
 */
export function guardianLevel(run: Run, boss: Creature): number {
  const ceiling = BALANCE.floorLevelCap[run.floor + 1] ?? Infinity;
  return Math.max(1, Math.min(stageCap({ stage: boss.stage, stars: guardianStars(boss) }), ceiling, boss.level + GUARDIAN_BONUS_LEVELS));
}

/** Prestige stars a claimed guardian keeps: the ones it had in battle. */
export const guardianStars = (boss: Creature) => Math.min(MAX_STARS, boss.stars ?? 0);

/** Boss boon: one of the guardian's creatures joins at its level +5, keeping its evolved form and its stars. */
export function claimGuardian(run: Run, boss: Creature, release?: Creature): Creature | null {
  if (!canMakeRoom(run, release)) return null;
  const c = createCreature(boss.speciesId, guardianLevel(run, boss), boss.stage);
  c.stars = guardianStars(boss);
  c.nature = boss.nature;
  c.trait = boss.trait;
  c.hp = stats(c).hp;
  // A shiny guardian Hexling (Shiny Hunting) keeps its colours.
  if (boss.shiny) {
    c.shiny = true;
    noteShinyOwned(run.meta, c.speciesId);
  }
  addToParty(run, c, release);
  return c;
}

/**
 * After a win: each of your Hexlings that fought (and is still standing) wins one more battle with
 * you. Returns a line for each one that gained a bond heart.
 */
export function growBond(run: Run, fought: number[]): string[] {
  const out: string[] = [];
  for (const c of run.team) {
    if (!fought.includes(c.uid) || c.hp <= 0) continue;
    const before = bondHearts(c.bond);
    c.bond = (c.bond ?? 0) + 1;
    const now = bondHearts(c.bond);
    if (now > before) out.push(`${creatureName(c)} trusts you more! (bond ${'♥'.repeat(now)})`);
  }
  return out;
}

/** Mark a creature that joined some other way (shop recruit) as caught in the dex. */
/**
 * A creature joined your party (caught, claimed, recruited or hatched): record it in the Dex and
 * unlock its species as a starter right away, whether or not this run is won.
 * Returns true if it's a newly unlocked starter.
 */
export function registerJoin(run: Run, c: Creature): boolean {
  const meta = run.meta;
  // A legendary: caught for good (it roams no more) and in the Hexlidex, but never a starter.
  if (isLegend(c.speciesId)) {
    (meta.legends ??= {})[c.speciesId] = { ...(meta.legends[c.speciesId] ?? { hp: 1 }), caught: true };
    if (!meta.dex.caught.includes(c.speciesId)) meta.dex.caught.push(c.speciesId);
    if (run.roamer?.id === c.speciesId) run.roamer = null;
    run.unlockedThisRun.push(`Legendary: ${SPECIES_BY_ID[c.speciesId].names[2]} (Hexlidex and Arena)`);
    saveMeta(meta);
    return false;
  }
  // Anyone joining without a nature (a recruit, an egg...) gets one, keeping its share of health.
  if (!c.nature) {
    const frac = c.hp / stats(c).hp;
    c.nature = natureFor(`${run.seed}:${c.uid}:${c.speciesId}`);
    c.trait ??= rollTrait(c.speciesId, `${run.seed}:${c.uid}`);
    c.hp = Math.max(1, Math.round(stats(c).hp * frac));
  }
  applyCampBond(run, c);
  if (!meta.dex.caught.includes(c.speciesId)) meta.dex.caught.push(c.speciesId);
  let fresh = false;
  if (!meta.unlockedStarters.includes(c.speciesId)) {
    meta.unlockedStarters.push(c.speciesId);
    run.unlockedThisRun.push(`Starter: ${SPECIES_BY_ID[c.speciesId].names[0]}`);
    fresh = true;
  }
  saveMeta(meta);
  return fresh;
}

export function isUnlockedStarter(run: Run, speciesId: string): boolean {
  return run.meta.unlockedStarters.includes(speciesId);
}

/** Evolve a creature and count it toward achievements. */
export function evolveTracked(run: Run, c: Creature): boolean {
  if (!evolve(c)) return false;
  track(run.meta, 'evolutions');
  saveMeta(run.meta);
  return true;
}

/** "Stored XP poured in" line for a creature whose cap just rose, given its level before. */
export function releaseNote(c: Creature, before: number): string {
  return c.level > before ? `\nStored XP: +${c.level - before} lv (now Lv ${c.level})` : '';
}

/** Gain coins (counts toward the Prospector achievement). */
export function earnCoins(run: Run, n: number) {
  run.coins += n;
  run.log.coins = (run.log.coins ?? 0) + n;
  trackStat(run, 'coinsEarned', n);
}

/** Prestige a creature (counts toward the Ascension achievement). */
/**
 * What the Prestige Altar can do for you right now: each Hexling that can gain a star, with the bench
 * Hexlings it could take as a sacrifice (they share an element with it), and whether Ascendant's
 * free prestige is available on this floor.
 */
export function altarOptions(run: Run): { free: boolean; pairs: { target: Creature; fodder: Creature[] }[] } {
  const free = run.passive === 'ascendant' && run.ascendFloor !== run.floor && allCreatures(run).some(canPrestige);
  const pairs = allCreatures(run)
    .filter(canPrestige)
    .map((target) => ({ target, fodder: run.bench.filter((b) => b !== target && sharesType(b, target)) }))
    .filter((p) => p.fodder.length > 0);
  return { free, pairs };
}

/** True when the altar has something for you (a valid pair, or Ascendant's free prestige). */
export const altarUsable = (run: Run) => {
  const o = altarOptions(run);
  return o.free || o.pairs.length > 0;
};

export function prestigeTracked(run: Run, c: Creature): boolean {
  if (!prestige(c)) return false;
  trackStat(run, 'stars');
  return true;
}

/** Odds for 50/50 events, improved by Lucky Charm. */
export function luckyOdds(run: Run): number {
  return run.passive === 'lucky' ? 0.75 : 0.5;
}

/** Bump a lifetime counter for this run's player and save. */
export function trackStat(run: Run, stat: keyof MetaStats, by = 1) {
  track(run.meta, stat, by);
  saveMeta(run.meta);
}

/** Called after a floor boss is defeated. Returns true if the run is won. */
export function clearFloor(run: Run): boolean {
  const meta = run.meta;
  meta.bossesDefeated += 1;
  if (run.hunt) {
    // Shiny Hunting never ends in a win: deeper you go.
    run.hunt.depth += 1;
    noteHunt(meta, run.hunt.depth, run.heat ?? 0);
    saveMeta(meta);
    for (const c of allCreatures(run)) restoreUses(c);
    nextHuntFloor(run);
    return false;
  }
  if (run.floor === FLOORS - 1) {
    // Winning a run unlocks the next map and the next passive.
    const before = unlockedMaps(meta).length;
    meta.wins += 1;
    const heat = run.heat ?? 0;
    if (heat >= (meta.heatUnlocked ?? 0) && heat < MAX_HEAT) {
      meta.heatUnlocked = heat + 1;
      run.unlockedThisRun.push(`Heat ${heat + 1}`);
    }
    for (const m of unlockedMaps(meta).slice(before)) run.unlockedThisRun.push(`Map: ${m.name}`);
    if (!meta.clearedMaps.includes(run.mapId)) meta.clearedMaps.push(run.mapId);
    // A Heat token for this map.
    if (heat > 0 && !run.daily) {
      meta.mapHeats = meta.mapHeats ?? {};
      const won = (meta.mapHeats[run.mapId] = meta.mapHeats[run.mapId] ?? []);
      if (!won.includes(heat)) {
        won.push(heat);
        won.sort((a, b) => a - b);
        run.unlockedThisRun.push(`Heat ${heat} token: ${MAP_BY_ID[run.mapId]?.name ?? run.mapId}`);
      }
    }
    for (const a of checkAchievements(meta)) run.unlockedThisRun.push(`Passive: ${PASSIVES[a.passive].name}`);
    saveMeta(meta);
    return true;
  }
  saveMeta(meta);
  run.floor += 1;
  // A new floor: everyone's moves are fully restored.
  for (const c of allCreatures(run)) restoreUses(c);
  applyFloorCap(run);
  run.map = generateFloor(run.floor, run.biomes[run.floor], floorSeed(run));
  run.currentId = run.map.startId;
  run.visited = [run.map.startId];
  run.bossPending = false;
  placeRoamer(run);
  placeRival(run);
  return false;
}

// ---------------------------------------------------------------- your rival

/** Each run's rival: a name, and a lead line with the edge on your starter (both from the seed). */
export function makeRival(run: Run) {
  run.rival = null;
  if (run.race || run.hunt || !run.team[0]) return;
  const mine = creatureTypes(run.team[0]);
  const counters = SPECIES.filter((sp) => DEFAULT_STARTERS.includes(sp.id) || sp.types[0] === sp.types[1]).filter((sp) => typeMultiplier(sp.types[0], mine) > 1);
  const pool = counters.length ? counters : SPECIES;
  const h = hashString(`${run.seed}:rival`);
  run.rival = { name: TRAINER_NAMES[h % TRAINER_NAMES.length], ace: pool[(h >>> 8) % pool.length].id, node: null, beaten: [] };
  placeRival(run);
}

/**
 * The hex your rival waits on this floor: a trainer hex around the middle of the floor (a battle
 * hex becomes one if the floor has none there).
 */
export function placeRival(run: Run) {
  const r = run.rival;
  if (!r) return;
  r.node = null;
  const mid = (n: MapNode) => n.progress >= 0.3 && n.progress <= 0.8;
  const nodes = Object.values(run.map.nodes);
  const pickFrom = (xs: MapNode[]) => xs.sort((a, b) => Math.abs(a.progress - 0.55) - Math.abs(b.progress - 0.55) || a.id.localeCompare(b.id))[0];
  let n = pickFrom(nodes.filter((x) => x.kind === 'elite' && mid(x)));
  if (!n) {
    n = pickFrom(nodes.filter((x) => x.kind === 'battle' && mid(x)));
    if (n) n.kind = 'elite';
  }
  r.node = n?.id ?? null;
}

/** Is this the hex your rival waits on (and haven't you beaten them on this floor yet)? */
export const rivalHere = (run: Run, nodeId: string): boolean => !!run.rival && run.rival.node === nodeId && !run.rival.beaten.includes(run.floor);

export const rivalTrainerName = (r: Rival) => `Rival ${r.name}`;

/** Their team grows each floor (2, 3, then 4 Hexlings), led by their ace, which evolves as they go. */
function rivalTeam(run: Run, team: Creature[]): Creature[] {
  const r = run.rival!;
  const f = run.floor;
  const top = Math.max(...team.map((c) => c.level));
  const ace = createCreature(r.ace, top + 2, Math.min(2, f));
  ace.nature = natureFor(`${run.seed}:rival:ace`);
  ace.trait = rollTrait(ace.speciesId, `${run.seed}:rival:ace`);
  ace.stars = Math.max(...team.map((c) => c.stars));
  for (const m of ace.moves) m.tier = Math.max(m.tier, f > 0 ? 2 : 1);
  ace.hp = stats(ace).hp;
  const out = [...team.slice(0, f + 1), ace];
  return out;
}

/** You beat your rival on this floor. Returns what they say. */
export function rivalBeaten(run: Run): string {
  const r = run.rival;
  if (!r) return '';
  if (!r.beaten.includes(run.floor)) r.beaten.push(run.floor);
  return RIVAL_LOST[Math.min(run.floor, RIVAL_LOST.length - 1)];
}

/** What your rival says as the battle starts. */
export function rivalHello(run: Run): string {
  const r = run.rival;
  if (!r) return '';
  if (run.floor > 0 && !r.beaten.includes(run.floor - 1)) return RIVAL_SKIPPED;
  const lines = RIVAL_HELLO[Math.min(run.floor, RIVAL_HELLO.length - 1)];
  return pickLine(lines, `${run.seed}:${run.floor}:rival`).replace('{ace}', SPECIES_BY_ID[r.ace].names[Math.min(2, run.floor)]);
}
