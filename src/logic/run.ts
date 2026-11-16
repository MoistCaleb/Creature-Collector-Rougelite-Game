import { BOSSES } from '../data/trainers';
import * as storage from '../storage';
import { BALANCE } from '../data/balance';
import { HELD, HELD_IDS, type HeldId } from '../data/held';
import { heatRules, MAX_HEAT } from '../data/heat';
import { MAP_BY_ID, MAPS, mapUnlocked } from '../data/maps';
import { DEFAULT_STARTERS, SPECIES, SPECIES_BY_ID, speciesWithElement, type Species } from '../data/species';
import { ELEMENTS, typeMultiplier, type Element, type TypePair } from '../data/types';
import {
  bankLimit,
  gainXp,
  healFraction,
  catchUpMultiplier,
  createCreature,
  creatureName,
  prestige,
  evolve,
  setNextUid,
  xpToNext,
  creatureTypes,
  isAlive,
  releaseBanked,
  restoreUses,
  setFloorCeiling,
  stageCap,
  stats,
  type Creature,
} from './creature';
import { checkAchievements, emptyStats, track, type MetaStats } from './achievements';
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
  mentor: { name: 'Mentor', desc: 'Bench creatures earn full XP instead of half.' },
  medic: { name: 'Field Medic', desc: 'Rest nodes heal your team to full.' },
  scout: { name: 'Scout', desc: 'Caught creatures arrive 3 levels higher.' },
  drill: { name: 'Drill Sergeant', desc: 'Your creatures deal 10% more damage.' },
  haggler: { name: 'Haggler', desc: 'Shop prices are 25% lower.' },
  evolutionist: { name: 'Evolutionist', desc: 'Start each run with an Evolution Stone.' },
  explorer: { name: 'Explorer', desc: 'Treasure chests hold 50% more coins.' },
  champion: { name: 'Champion', desc: 'Your starter begins at level 10.' },
  coinpurse: { name: 'Coin Purse', desc: 'Start each run with 50 coins.' },
  trainer: { name: 'Personal Trainer', desc: 'Level Up nodes give 50% more levels.' },
  sage: { name: 'Sage', desc: 'Skill Shrines offer 4 choices instead of 3.' },
  ascendant: { name: 'Ascendant', desc: 'Prestige Altars need no sacrifice.' },
  bodyguard: { name: 'Bodyguard', desc: 'Bench steps in fully healed after a wipe.' },
  hunter: { name: 'Big Game Hunter', desc: 'Trainers always drop an Evolution Stone, sometimes 2.' },
  naturalist: { name: 'Naturalist', desc: 'Wild battles give 25% more XP.' },
  ironwill: { name: 'Iron Will', desc: 'Survivors heal 70% after wins, not 40%.' },
  lucky: { name: 'Lucky Charm', desc: 'Coin-flip events succeed 75% of the time.' },
  apothecary: { name: 'Apothecary', desc: '2 starting potions, carry 8, they heal 75%.' },
  quartermaster: { name: 'Quartermaster', desc: 'Start each run with two random held items.' },
  afflicter: { name: 'Afflicter', desc: 'Your moves inflict statuses twice as often.' },
  tempered: { name: 'Tempered', desc: 'Your creatures can\u2019t be burned or poisoned.' },
  harmonist: { name: 'Harmonist', desc: 'Team synergy bonuses are doubled.' },
};

// ---------------------------------------------------------------- meta save

export interface Meta {
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
  /** Heat levels (1-8) won on each map, for the map's Heat tokens. */
  mapHeats?: Record<string, number[]>;
  /** Today's daily run: best result and how many tries. */
  daily?: DailyRecord;
  /** Favorite evolution line (species id): always one of the starter choices. */
  favorite?: string;
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
    checkAchievements(meta);
    return meta;
  } catch {
    return fallback;
  }
}

export function saveMeta(meta: Meta) {
  try {
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
  log: {
    battlesWon: number;
    caught: number;
    lost: number;
    fights: number;
    /** Added later; older saves lack these. */
    coins?: number;
    fallen?: FallenRecord[];
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
}

export interface ActiveBattle {
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

/** Record a finished daily run. Returns true if it's a new best for the day. */
export function recordDaily(run: Run, won: boolean): boolean {
  const meta = run.meta;
  if (!run.daily) return false;
  if (meta.daily?.date !== run.daily) meta.daily = { date: run.daily, attempts: 1, best: null };
  const floor = won ? FLOORS : run.floor;
  const result: DailyResult = { won, floor, battlesWon: run.log.battlesWon, score: dailyScore(won, floor, run.log.battlesWon) };
  const better = !meta.daily.best || result.score > meta.daily.best.score;
  if (better) meta.daily.best = result;
  saveMeta(meta);
  return better;
}

/** Short description of a daily result. */
export function describeDaily(r: DailyResult): string {
  return r.won ? `Won! · ${r.battlesWon} battles` : `Floor ${r.floor + 1} · ${r.battlesWon} battles`;
}

export function startRun(meta: Meta, starterId: string, seed = Date.now(), mapId = 'wildlands', daily?: string): Run {
  const rng = new Rng(seed);
  const def = MAP_BY_ID[mapId] ?? MAP_BY_ID.wildlands;
  const biomes = def.biomes ? [...def.biomes] : rng.shuffle([...ELEMENTS]).slice(0, FLOORS);
  if (!daily) meta.lastMap = def.id;
  const map = generateFloor(0, biomes[0], rng.int(0, 2 ** 31));
  meta.runs += 1;
  if (daily) {
    if (meta.daily?.date !== daily) meta.daily = { date: daily, attempts: 0, best: null };
    meta.daily.attempts += 1;
  }
  // Daily runs are the same for everyone: no passive, standard Heat.
  const passive = daily ? null : meta.equippedPassive;
  saveMeta(meta);
  const run: Run = {
    heat: daily ? 0 : Math.min(meta.heat ?? 0, meta.heatUnlocked ?? 0),
    ...(daily ? { daily } : {}),
    rng,
    seed,
    meta,
    passive,
    floor: 0,
    biomes,
    map,
    currentId: map.startId,
    visited: [map.startId],
    team: [createCreature(starterId, passive === 'champion' ? 10 : BALANCE.starterLevel)],
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
  applyFloorCap(run);
  return run;
}

/**
 * Set the level ceiling for the run's current floor. When it rises (new floor), XP your creatures
 * stored while held back pours in. Creatures already above it (older saves) keep their levels.
 */
export function applyFloorCap(run: Run) {
  setFloorCeiling(BALANCE.floorLevelCap[run.floor] ?? Infinity);
  for (const c of allCreatures(run)) releaseBanked(c);
}

// ---------------------------------------------------------------- saving a run in progress

const RUN_KEY = 'ccr-run-v1';

/** Persist the run so a reload resumes exactly here. */
export function saveRun(run: Run) {
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
    return run;
  } catch {
    return null;
  }
}

export function clearSavedRun() {
  try {
    storage.removeItem(RUN_KEY);
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
  return run.map.nodes[id];
}

export function allCreatures(run: Run): Creature[] {
  return [...run.team, ...run.bench];
}

export function highestLevel(run: Run): number {
  return Math.max(1, ...allCreatures(run).map((c) => c.level));
}

/** A creature lost during the run, remembered for the summary. */
export interface FallenRecord {
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
export function postBattleRecover(run: Run) {
  const frac = (run.passive === 'ironwill' ? BALANCE.ironWillHeal : BALANCE.postBattleHeal) * heatRules(run.heat ?? 0).healMult;
  for (const c of run.team) if (isAlive(c)) c.hp = Math.min(stats(c).hp, c.hp + Math.ceil(stats(c).hp * frac));
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
    ...fallen.map((c) => ({ speciesId: c.speciesId, stage: c.stage, level: c.level, name: creatureName(c), dealt: c.dealt ?? 0, kos: c.kos ?? 0 })),
  ];
  return fallen.map(creatureName);
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
  const max = BALANCE.enemyStarMax[run.floor] ?? 0;
  if (!max || !run.team.length) return 0;
  const avg = Math.round(run.team.reduce((t, c) => t + c.stars, 0) / run.team.length);
  const n = avg + (kind === 'boss' ? BALANCE.bossStarBonus : kind === 'battle' ? rng.int(-1, 0) : 0);
  return Math.max(0, Math.min(max, n));
}

export function makeEncounter(run: Run, node: MapNode): Creature[] {
  const kind = node.kind as EncounterKind;
  const rng = run.rng;
  const f = run.floor;
  const biome = run.biomes[f];
  const count =
    kind === 'boss' ? (f === 0 ? 2 : 3) : kind === 'elite' ? (f === 0 ? 2 : 3) : f === 0 ? 1 : rng.chance(0.5) ? 2 : 1;

  const enemies: Creature[] = [];
  const boss = kind === 'boss' ? BOSSES[biome] : null;
  const heat = heatRules(run.heat ?? 0, f);
  for (let i = 0; i < count; i++) {
    let pool = rng.chance(0.7) ? speciesWithElement(biome) : SPECIES;
    if (boss) {
      // Guardians field a themed team; their ace pairs the boss element with its partner.
      const own = speciesWithElement(biome);
      const ace = own.filter((sp) => sp.types.includes(boss.partner));
      pool = i === count - 1 && ace.length ? ace : own;
    }
    // The run's first battle is always a neutral matchup with your starter.
    if (!boss && run.log.fights === 0 && run.team[0]) pool = fairPool(pool, creatureTypes(run.team[0]), neutralMatchup);
    const sp = rng.pick(pool);
    let level = BALANCE.floorBaseLevel[f] + Math.round(Math.pow(node.progress, BALANCE.rampCurve) * BALANCE.floorRamp[f]) + rng.int(-1, f === 0 ? 0 : 1);
    let stage = f;
    level += heat.enemyLevels;
    if (kind === 'elite') level += BALANCE.eliteLevelBonus + heat.eliteLevels;
    if (kind === 'boss') {
      level = BALANCE.bossLevel[f] + (i === count - 1 ? 2 : 0) + heat.enemyLevels + heat.bossLevels;
      stage = Math.min(2, f + (i === count - 1 && BALANCE.bossLeadEvolves[f] ? 1 : 0));
    }
    const c = createCreature(sp.id, Math.max(1, level), stage);
    c.stars = enemyStars(run, kind, rng);
    if (kind !== 'battle' && f > 0) {
      for (const m of c.moves) if (rng.chance(0.4)) m.tier = 2;
    }
    if (kind === 'boss' && f === 2) for (const m of c.moves) m.tier = Math.max(m.tier, 2);
    // Trainers and guardians carry held items (the guardian's ace always, trainers sometimes from floor 2).
    const holds = boss ? i === count - 1 || heat.bossTeamItems : kind === 'elite' && (heat.eliteItems || (f > 0 && rng.chance(0.4)));
    if (holds) c.held = rollHeld(rng);
    c.hp = stats(c).hp;
    enemies.push(c);
  }
  run.log.fights += 1;
  return enemies;
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
function fairPool(pool: Species[], lead: TypePair, test: (sp: Species, lead: TypePair) => boolean): Species[] {
  const a = pool.filter((sp) => test(sp, lead));
  if (a.length) return a;
  const b = SPECIES.filter((sp) => test(sp, lead));
  if (b.length) return b;
  const c = SPECIES.filter((sp) => noAdvantageOver(sp, lead));
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

export function battleCoins(enemies: Creature[], kind: EncounterKind, heat = 0): number {
  const mult = (kind === 'boss' ? 3 : kind === 'elite' ? BALANCE.trainerCoinMult : 1) * heatRules(heat).coinMult;
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
  const benchShare = run.passive === 'mentor' ? 1 : BALANCE.benchXpShare;
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
  const stars = catchBonus(run, enemy.speciesId) ? 1 : 0;
  const bonus = run.passive === 'scout' ? SCOUT_BONUS_LEVELS : 0;
  return Math.min(stageCap({ stage: enemy.stage, stars }), enemy.level + bonus);
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
  if (bonus) c.stars = 1;
  c.hp = Math.max(1, Math.round(stats(c).hp * BALANCE.catchHp));
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
  return Math.max(1, Math.min(stageCap({ stage: boss.stage, stars: 0 }), ceiling, boss.level + GUARDIAN_BONUS_LEVELS));
}

/** Boss boon: one of the guardian's creatures joins at its level +5, keeping its evolved form. */
export function claimGuardian(run: Run, boss: Creature, release?: Creature): Creature | null {
  if (!canMakeRoom(run, release)) return null;
  const c = createCreature(boss.speciesId, guardianLevel(run, boss), boss.stage);
  addToParty(run, c, release);
  return c;
}

/** Mark a creature that joined some other way (shop recruit) as caught in the dex. */
/**
 * A creature joined your party (caught, claimed, recruited or hatched): record it in the Dex and
 * unlock its species as a starter right away, whether or not this run is won.
 * Returns true if it's a newly unlocked starter.
 */
export function registerJoin(run: Run, c: Creature): boolean {
  const meta = run.meta;
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
  run.map = generateFloor(run.floor, run.biomes[run.floor], run.rng.int(0, 2 ** 31));
  run.currentId = run.map.startId;
  run.visited = [run.map.startId];
  run.bossPending = false;
  return false;
}
