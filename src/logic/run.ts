import * as storage from '../storage';
import { BALANCE } from '../data/balance';
import { MAP_BY_ID, MAPS, mapUnlocked } from '../data/maps';
import { DEFAULT_STARTERS, SPECIES, SPECIES_BY_ID, speciesWithElement, type Species } from '../data/species';
import { ELEMENTS, typeMultiplier, type Element, type TypePair } from '../data/types';
import {
  addXp,
  catchUpMultiplier,
  createCreature,
  creatureName,
  prestige,
  evolve,
  setNextUid,
  xpToNext,
  creatureTypes,
  isAlive,
  stats,
  type Creature,
} from './creature';
import { checkAchievements, emptyStats, track, type MetaStats } from './achievements';
import { emptyDex, type Dex } from './dex';
import type { Shop } from './shop';
import { generateFloor, type FloorMap, type MapNode, type NodeKind } from './map';
import { Rng } from './rng';

export const TEAM_MAX = 4;
export const BENCH_MAX = 3;
export const FLOORS = 3;

// ---------------------------------------------------------------- passives

export type PassiveId =
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
  scout: { name: 'Scout', desc: 'Caught creatures start at level 5.' },
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
  hunter: { name: 'Big Game Hunter', desc: 'Elites drop 2 Evolution Stones.' },
  naturalist: { name: 'Naturalist', desc: 'Wild battles give 25% more XP.' },
  ironwill: { name: 'Iron Will', desc: 'Survivors recover 85% HP after wins.' },
  lucky: { name: 'Lucky Charm', desc: 'Coin-flip events succeed 75% of the time.' },
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
  coins: number;
  /** Open shop at the current node, if any. */
  shop: Shop | null;
  /** Elements that already earned the post-Dex catch bonus this run. */
  claimedTypes: Element[];
  /** Lost to a boss but survived via the bench: must re-fight it. */
  bossPending: boolean;
  log: { battlesWon: number; caught: number; lost: number; fights: number };
  unlockedThisRun: string[];
  mapId: string;
  /** A node whose choice hasn't been made yet (so a reload re-offers it). */
  pendingNode: NodeKind | null;
  /** The battle in progress (or awaiting its reward choice). */
  activeBattle: ActiveBattle | null;
  /** The event on offer at the current node, if any. */
  eventId: string | null;
  /** The open treasure chest's contents, fixed once rolled. */
  treasure: { coins: number; item: import('./shop').ItemId } | null;
}

export interface ActiveBattle {
  kind: EncounterKind;
  enemies: Creature[];
  /** Win bookkeeping (XP, coins, burials) already done; only the reward choice remains. */
  settled: boolean;
  /** uids of your creatures that took part (full XP). */
  fought?: number[];
  summary: string;
}

export function rollStarterChoices(meta: Meta, rng: Rng): string[] {
  return rng.shuffle([...meta.unlockedStarters]).slice(0, 3);
}

export function startRun(meta: Meta, starterId: string, seed = Date.now(), mapId = 'wildlands'): Run {
  const rng = new Rng(seed);
  const def = MAP_BY_ID[mapId] ?? MAP_BY_ID.wildlands;
  const biomes = def.biomes ? [...def.biomes] : rng.shuffle([...ELEMENTS]).slice(0, FLOORS);
  meta.lastMap = def.id;
  const map = generateFloor(0, biomes[0], rng.int(0, 2 ** 31));
  meta.runs += 1;
  saveMeta(meta);
  return {
    rng,
    seed,
    meta,
    passive: meta.equippedPassive,
    floor: 0,
    biomes,
    map,
    currentId: map.startId,
    visited: [map.startId],
    team: [createCreature(starterId, meta.equippedPassive === 'champion' ? 10 : BALANCE.starterLevel)],
    bench: [],
    evoStones: meta.equippedPassive === 'evolutionist' ? 1 : 0,
    coins: meta.equippedPassive === 'coinpurse' ? 50 : 0,
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

/** Survivors catch their breath after a win. */
export function postBattleRecover(run: Run) {
  const frac = run.passive === 'ironwill' ? 0.85 : BALANCE.postBattleHeal;
  for (const c of run.team) if (isAlive(c)) c.hp = Math.min(stats(c).hp, c.hp + Math.ceil(stats(c).hp * frac));
}

/** Remove fainted creatures (permadeath). Returns their names. */
export function buryFallen(run: Run): string[] {
  const fallen = run.team.filter((c) => !isAlive(c));
  run.team = run.team.filter(isAlive);
  run.log.lost += fallen.length;
  return fallen.map(creatureName);
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

export function makeEncounter(run: Run, node: MapNode): Creature[] {
  const kind = node.kind as EncounterKind;
  const rng = run.rng;
  const f = run.floor;
  const biome = run.biomes[f];
  const count =
    kind === 'boss' ? (f === 0 ? 2 : 3) : kind === 'elite' ? (f === 0 ? 2 : 3) : f === 0 ? 1 : rng.chance(0.5) ? 2 : 1;

  const enemies: Creature[] = [];
  for (let i = 0; i < count; i++) {
    let pool = rng.chance(0.7) ? speciesWithElement(biome) : SPECIES;
    // The run's first battle is always a neutral matchup with your starter.
    if (run.log.fights === 0 && run.team[0]) pool = fairPool(pool, creatureTypes(run.team[0]), neutralMatchup);
    const sp = rng.pick(pool);
    let level = BALANCE.floorBaseLevel[f] + Math.round(Math.pow(node.progress, BALANCE.rampCurve) * BALANCE.floorRamp[f]) + rng.int(-1, f === 0 ? 0 : 1);
    let stage = f;
    if (kind === 'elite') level += BALANCE.eliteLevelBonus;
    if (kind === 'boss') {
      level = BALANCE.bossLevel[f] + (i === count - 1 ? 2 : 0);
      stage = Math.min(2, f + (i === count - 1 && BALANCE.bossLeadEvolves[f] ? 1 : 0));
    }
    const c = createCreature(sp.id, Math.max(1, level), stage);
    if (kind !== 'battle' && f > 0) {
      for (const m of c.moves) if (rng.chance(0.4)) m.tier = 2;
    }
    if (kind === 'boss' && f === 2) for (const m of c.moves) m.tier = Math.max(m.tier, 2);
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
}

export function battleCoins(enemies: Creature[], kind: EncounterKind): number {
  const mult = kind === 'boss' ? 3 : kind === 'elite' ? 2 : 1;
  return Math.round(enemies.reduce((s, e) => s + BALANCE.coinsBase + e.level * BALANCE.coinsPerEnemyLevel, 0) * mult);
}

export function battleXp(enemies: Creature[], kind: EncounterKind, floor = 0): number {
  const mult = kind === 'boss' ? 2 : kind === 'elite' ? 1.5 : 1;
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
    const xp = Math.round(amount * share * catchUpMultiplier(c.level, top));
    out.push({ name: creatureName(c), xp, levels: addXp(c, xp) });
  }
  for (const c of run.bench) {
    const xp = Math.round(amount * benchShare * catchUpMultiplier(c.level, top));
    out.push({ name: creatureName(c), xp, levels: addXp(c, xp) });
  }
  return out;
}

export function rosterFull(run: Run): boolean {
  return run.team.length >= TEAM_MAX && run.bench.length >= BENCH_MAX;
}

function addToParty(run: Run, c: Creature) {
  if (run.team.length < TEAM_MAX) run.team.push(c);
  else run.bench.push(c);
  registerJoin(run, c);
}

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
export function catchCreature(
  run: Run,
  enemy: Creature,
): { c: Creature; bonus: CatchBonus; newlyClaimed: Element[] } | null {
  if (rosterFull(run)) return null;
  const c = createCreature(enemy.speciesId, run.passive === 'scout' ? 5 : 1);
  const bonus = catchBonus(run, c.speciesId);
  if (bonus) {
    c.stars = 1;
    c.hp = stats(c).hp;
  }
  const newlyClaimed: Element[] = [];
  if (bonus === 'type')
    for (const t of creatureTypes(c))
      if (!run.claimedTypes.includes(t)) {
        run.claimedTypes.push(t);
        newlyClaimed.push(t);
      }
  addToParty(run, c);
  run.log.caught += 1;
  track(run.meta, 'caught');
  saveMeta(run.meta);
  return { c, bonus, newlyClaimed };
}

/** Boss boon: one of the guardian's creatures joins at Lv 1, keeping its evolved form. */
export function claimGuardian(run: Run, boss: Creature): Creature | null {
  if (rosterFull(run)) return null;
  const c = createCreature(boss.speciesId, 1, boss.stage);
  addToParty(run, c);
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

/** Gain coins (counts toward the Prospector achievement). */
export function earnCoins(run: Run, n: number) {
  run.coins += n;
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
    for (const m of unlockedMaps(meta).slice(before)) run.unlockedThisRun.push(`Map: ${m.name}`);
    if (!meta.clearedMaps.includes(run.mapId)) meta.clearedMaps.push(run.mapId);
    for (const a of checkAchievements(meta)) run.unlockedThisRun.push(`Passive: ${PASSIVES[a.passive].name}`);
    saveMeta(meta);
    return true;
  }
  saveMeta(meta);
  run.floor += 1;
  run.map = generateFloor(run.floor, run.biomes[run.floor], run.rng.int(0, 2 ** 31));
  run.currentId = run.map.startId;
  run.visited = [run.map.startId];
  run.bossPending = false;
  return false;
}
