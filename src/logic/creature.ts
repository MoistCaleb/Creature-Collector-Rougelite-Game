import { natureMult } from '../data/natures';
import { BALANCE } from '../data/balance';
import { weatherId, type WeatherId } from '../data/moves';
import { attackEl, attackId, attackValue, BULWARK_ID, fastId, slowId, WARP_ID, buffId, debuffId, extraId, MAX_TIER, maxUses, MOVES, specialId, teamMoveId, type MoveDef } from '../data/moves';
import { hashString, Rng } from './rng';
import { SPECIES, SPECIES_BY_ID, type BaseStats, type Species } from '../data/species';
import { stabMultiplier, type Element, type TypePair } from '../data/types';

export interface MoveSlot {
  id: string;
  tier: number; // 1..3 (skill buffs)
  /** Uses spent (moves with a limit only; see maxUses). Carries between battles. */
  used?: number;
}

export interface Creature {
  uid: number;
  speciesId: string;
  level: number;
  xp: number;
  stage: number; // 0..2 evolution stage
  stars: number; // prestige
  hp: number;
  moves: MoveSlot[];
  /** Index of the next learnset entry not yet processed. */
  learnIndex: number;
  /** Moves the creature wants to learn but has no free slot for (player decides). */
  pendingMoves: string[];
  /** Damage dealt and knockouts this run (for the run summary). */
  dealt?: number;
  kos?: number;
  /** A status condition that lasts between battles until its timer runs out (or it's cured). */
  status?: { id: import('../data/status').StatusId; turns: number };
  /** The one item this creature carries. */
  held?: import('../data/held').HeldId;
  /** XP earned while at the level cap, released when the cap rises (evolve or prestige). */
  banked?: number;
  /** Has been offered its team move (learned at TEAM_MOVE_LEVEL). */
  teamOffered?: boolean;
  /** A rare color variant (about 1 wild Hexling in 200). Cosmetic; kept when caught and evolved. */
  shiny?: boolean;
  /** Extra moves (see extraMoves) it has already been offered. */
  extraOffered?: string[];
  /** Moves it learned from the land it was on (instead of a move from its own learnset). */
  landMoves?: string[];
  /** Land moves learned since they were last announced. */
  landNews?: string[];
  /** Its nature: a small stat lean (runs only; Arena teams have none). */
  nature?: import('../data/natures').NatureId;
  /** Battles won with you this run (bond hearts, see data/natures). */
  bond?: number;
}

export type Stats = BaseStats;

export const MAX_STAGE = 2;
export const MAX_STARS = 5;
export const MAX_MOVES = 4;
const STAGE_MULT = [1, 1.35, 1.7];
const STAR_MULT = 0.15;

let nextUid = 1;
export function setNextUid(n: number) {
  nextUid = n;
}

export function species(c: Creature): Species {
  return SPECIES_BY_ID[c.speciesId];
}

export function creatureName(c: Creature): string {
  return species(c).names[c.stage];
}

export function creatureTypes(c: Creature): TypePair {
  return species(c).types;
}

/** Level caps per evolution stage; each prestige star adds 5. */
export const STAGE_CAPS = [30, 65, 100];
export function stageCap(c: Pick<Creature, 'stage' | 'stars'>): number {
  return STAGE_CAPS[c.stage] + c.stars * 5;
}

/**
 * The current floor's level ceiling (set by the run). Your creatures can't level past it, so you
 * can't outgrow a floor; XP beyond it is stored and pays coins, and it opens up on the next floor.
 */
let floorCeiling = Infinity;
export function setFloorCeiling(n: number) {
  floorCeiling = n;
}
export const getFloorCeiling = () => floorCeiling;

/** Effective level cap: the stage cap, or the floor ceiling if that's lower. */
export function levelCap(c: Pick<Creature, 'stage' | 'stars'>): number {
  return Math.min(stageCap(c), floorCeiling);
}

/** True when the floor ceiling (not the creature's own stage cap) is what's holding it back. */
export const floorCapped = (c: Pick<Creature, 'stage' | 'stars'>) => floorCeiling < stageCap(c);

export function xpToNext(level: number): number {
  return Math.round(10 + level * BALANCE.xpPerLevelNeeded + level * level * BALANCE.xpQuad);
}

export interface LearnEntry {
  id: string;
  level: number;
}

/**
 * Ordered list of moves a species learns, each at a level. Every family draws its own mix from its
 * elements' pools (seeded by species id) and learns its signature move at level 20.
 * Line attacks are listed at base rank and shift up on evolved creatures.
 */
export function learnset(sp: Species): LearnEntry[] {
  const cached = LEARNSET_CACHE.get(sp.id);
  if (cached) return cached;
  const r = new Rng(hashString(sp.id + ':learn'));
  const [a, b] = sp.types;
  const pure = a === b;
  const statusOf = (el: Element) => [buffId(el), debuffId(el), extraId(el)];
  const specialsOf = (el: Element) => [specialId(el, 0), specialId(el, 1), specialId(el, 2)];
  const pickFrom = (list: string[], used: Set<string>) => {
    const left = list.filter((x) => !used.has(x));
    const pick = left.length ? r.pick(left) : list[0];
    used.add(pick);
    return pick;
  };
  const used = new Set<string>();
  const statusPool = pure ? statusOf(a) : [...statusOf(a), ...statusOf(b)];
  const specialPool = pure ? specialsOf(a) : [...specialsOf(a), ...specialsOf(b)];
  // Starting moves stay light: no heavy hits or flurries at level 1.
  const light = specialPool.filter((id) => !MOVES[id].hits && !MOVES[id].recoil);
  const out: LearnEntry[] = [
    { id: attackId(a, 0), level: 1 },
    { id: pure ? pickFrom(light.length ? light : [attackId(a, 1)], used) : attackId(b, 0), level: 1 },
    { id: pickFrom(statusPool, used), level: 6 },
    { id: pickFrom(specialPool, used), level: 12 },
    { id: sp.signature, level: 20 },
    { id: attackId(pure ? a : r.pick([a, b]), 2), level: 32 },
    { id: pickFrom(r.chance(0.5) ? statusPool : specialPool, used), level: 45 },
    { id: attackId(a, 3), level: 60 },
  ];
  LEARNSET_CACHE.set(sp.id, out);
  return out;
}
const LEARNSET_CACHE = new Map<string, LearnEntry[]>();

export function knows(c: Creature, id: string): boolean {
  return c.moves.some((m) => m.id === id);
}

/** Pick an attack of this element the creature doesn't already know, preferring `rank` and above. */
function unknownAttack(c: Creature, el: Element, rank: number): string | null {
  for (let r = Math.min(3, rank); r <= 3; r++) if (!knows(c, attackId(el, r))) return attackId(el, r);
  for (let r = Math.min(3, rank) - 1; r >= 0; r--) if (!knows(c, attackId(el, r))) return attackId(el, r);
  return null;
}

/** Resolve a learnset entry to a concrete move id for this creature (no duplicates). */
function resolveLearn(c: Creature, id: string): string | null {
  const def = MOVES[id];
  if (def.kind === 'attack' && def.rank >= 0) return unknownAttack(c, attackEl(def), def.rank + c.stage);
  return knows(c, id) ? null : id;
}

/**
 * Learn every move the creature's level now allows. With a full move list, the move goes to
 * pendingMoves for the player to decide, or (auto, for enemies) replaces its weakest attack.
 * Returns names of moves learned immediately.
 */
/** Level at which every creature gets its line's team move. */
export const TEAM_MOVE_LEVEL = 26;

/** Which element's team move a species learns: its own, or (dual types) one picked per family. */
export function teamElement(sp: Species): Element {
  const [a, b] = sp.types;
  return a === b || hashString(sp.id + ':team') % 2 === 0 ? a : b;
}

/**
 * The land your run is on (set with the floor). Now and then, a Hexling learns a move of the land's
 * element in place of the one its learnset has next; that standard move is then never offered.
 */
let land: { el: Element; seed: number } | null = null;
export function setLand(el: Element | null, seed = 0) {
  land = el ? { el, seed } : null;
}
export const getLand = () => land?.el ?? null;

/** Chance each learnset move (after the starting two, signatures excepted) comes from the land instead. */
export const LAND_MOVE_CHANCE = 0.12;

/**
 * The land move this learnset entry becomes for this creature, or null for the usual move. Same kind
 * of move as the entry (an attack of the same rank, a buff, a special...), of the land's element.
 * Never for a land that shares an element with it. Seeded, so reloading a save gives the same roll.
 */
export function landMoveFor(c: Creature, entry: LearnEntry, index: number): string | null {
  if (!land || index < 2) return null;
  const def = MOVES[entry.id];
  if (def.signature) return null;
  const el = land.el;
  if (creatureTypes(c).includes(el)) return null;
  const roll = hashString(`${land.seed}:${c.uid}:${index}:${el}:land`) % 1000;
  if (roll >= LAND_MOVE_CHANCE * 1000) return null;
  let id: string | null;
  if (def.kind === 'attack' && def.rank >= 0) id = unknownAttack(c, el, def.rank + c.stage);
  else {
    const m = /:(buff|debuff|extra|sp\d)$/.exec(entry.id);
    id = m ? `${el}:${m[1]}` : null;
  }
  return id && MOVES[id] && !knows(c, id) && !c.pendingMoves.includes(id) ? id : null;
}

/**
 * Moves only some lines learn, on top of their learnset, by what suits them: the fastest third
 * get a Blitz (stronger the faster they are) and the slowest third a Crush (stronger the slower);
 * slow Metal, Light, Shadow and Spirit lines (and bulky Spirit ones) learn Time Warp, and the
 * bulkiest of the rest learn Bulwark. Eight lines (WEATHER_LINES) learn a weather move.
 */
export function extraMoves(sp: Species): LearnEntry[] {
  const cached = EXTRA_CACHE.get(sp.id);
  if (cached) return cached;
  // The regular lines only (roaming legendaries don't shift who learns what).
  const all = SPECIES;
  const at = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * f)];
  const fast = at(all.map((x) => x.base.spd), 0.7);
  const slow = at(all.map((x) => x.base.spd), 0.3);
  const bulky = at(all.map((x) => x.base.def), 0.8);
  const spiritTank = at(all.map((x) => x.base.def), 0.75);
  const [a] = sp.types;
  const out: LearnEntry[] = [];
  if (sp.base.spd >= fast) out.push({ id: fastId(a), level: 16 });
  else if (sp.base.spd <= slow) out.push({ id: slowId(a), level: 16 });
  const warpTypes = ['Spirit', 'Shadow', 'Light', 'Metal'];
  const warp = (sp.base.spd <= slow && sp.types.some((t) => warpTypes.includes(t))) || (sp.types.includes('Spirit') && sp.base.def >= spiritTank);
  if (warp) out.push({ id: WARP_ID, level: 34 });
  else if (sp.base.def >= bulky) out.push({ id: BULWARK_ID, level: 30 });
  const w = WEATHER_LINES[sp.id];
  if (w) out.push({ id: weatherId(w), level: 28 });
  EXTRA_CACHE.set(sp.id, out);
  return out;
}
const EXTRA_CACHE = new Map<string, LearnEntry[]>();

/** The only lines that call up the weather: two for each kind. */
export const WEATHER_LINES: Record<string, WeatherId> = {
  flicklet: 'sun',
  pyrling: 'sun',
  jellet: 'rain',
  mistlet: 'rain',
  dustbun: 'dust',
  dunedrake: 'dust',
  snowmote: 'hail',
  rimehawk: 'hail',
};

export function learnMoves(c: Creature, auto = false): string[] {
  const learned: string[] = [];
  const set = learnset(species(c));
  // The team move comes on top of the learnset (so older saved creatures' learn order is untouched),
  // in level order: after anything learned up to Lv 26.
  const offerTeam = () => {
    if (c.teamOffered || c.level < TEAM_MOVE_LEVEL) return;
    c.teamOffered = true;
    const id = teamMoveId(teamElement(species(c)));
    if (knows(c, id)) return;
    if (c.moves.length < MAX_MOVES) {
      c.moves.push({ id, tier: 1 });
      learned.push(MOVES[id].name);
    } else if (!auto && !c.pendingMoves.includes(id)) c.pendingMoves.push(id);
  };
  // Extra moves, in level order among the rest (offered once each).
  const offerExtras = (below: number) => {
    for (const e of extraMoves(species(c))) {
      if (e.level > c.level || e.level >= below || c.extraOffered?.includes(e.id)) continue;
      c.extraOffered = [...(c.extraOffered ?? []), e.id];
      if (knows(c, e.id)) continue;
      if (c.moves.length < MAX_MOVES) {
        c.moves.push({ id: e.id, tier: 1 });
        learned.push(MOVES[e.id].name);
      } else if (auto) {
        // Enemies with a full list: a utility move (Bulwark, Time Warp) takes a stat move's place.
        // Blitz and Crush they only learn into a free slot, so they stay a tool more for you.
        const d = MOVES[e.id];
        const i = d.kind === 'attack' ? -1 : c.moves.findIndex((m) => MOVES[m.id].kind === 'buff' || MOVES[m.id].kind === 'debuff');
        if (i >= 0) c.moves[i] = { id: e.id, tier: 1 };
      } else if (!c.pendingMoves.includes(e.id)) c.pendingMoves.push(e.id);
    }
  };
  while (c.learnIndex < set.length && set[c.learnIndex].level <= c.level) {
    offerExtras(set[c.learnIndex].level);
    if (set[c.learnIndex].level > TEAM_MOVE_LEVEL) offerTeam();
    // Your Hexlings (not enemies) sometimes pick up a move from the land instead.
    const fromLand = auto ? null : landMoveFor(c, set[c.learnIndex], c.learnIndex);
    const id = fromLand ?? resolveLearn(c, set[c.learnIndex].id);
    c.learnIndex++;
    if (!id) continue;
    if (fromLand) c.landMoves = [...(c.landMoves ?? []), id];
    if (c.moves.length < MAX_MOVES) {
      c.moves.push({ id, tier: 1 });
      learned.push(MOVES[id].name);
      if (fromLand) c.landNews = [...(c.landNews ?? []), id];
    } else if (auto) {
      const nd = MOVES[id];
      if (nd.kind !== 'attack') continue;
      // Enemies swap their weakest attack for a stronger one (signatures always make the cut).
      const val = nd.signature ? Infinity : attackValue(nd);
      let weakest = -1;
      c.moves.forEach((m, i) => {
        const d = MOVES[m.id];
        if (d.kind === 'attack' && !d.signature && attackValue(d) < val && (weakest < 0 || attackValue(d) < attackValue(MOVES[c.moves[weakest].id])))
          weakest = i;
      });
      if (weakest >= 0) c.moves[weakest] = { id, tier: 1 };
    } else if (!c.pendingMoves.includes(id)) {
      c.pendingMoves.push(id);
    }
  }
  offerTeam();
  offerExtras(Infinity);
  return learned;
}

/**
 * How useful a whole move list is to this creature, for recommending what to forget.
 * Attacks count by expected damage with STAB; a second attack of an element you already hit
 * harder with is mostly redundant; status moves are worth a fair hit each, but stacking more
 * than one adds little; a list with no attack at all is useless.
 */
function moveSetValue(c: Creature, moves: MoveSlot[]): number {
  const types = creatureTypes(c);
  const attacks: { el: Element; v: number }[] = [];
  const status: number[] = [];
  for (const m of moves) {
    const d = MOVES[m.id];
    if (d.kind === 'attack') {
      let v = attackValue(d, m.tier) * (d.bestType ? stabMultiplier(types[0], types) : stabMultiplier(attackEl(d), types));
      if (d.priority || d.drain || d.execute || d.selfAfter || d.targetAfter) v *= 1.1;
      if (d.signature) v *= 1.15;
      attacks.push({ el: d.bestType ? types[0] : attackEl(d), v });
    } else {
      status.push((d.kind === 'heal' ? 60 : 50) * (1 + 0.15 * (m.tier - 1)));
    }
  }
  if (attacks.length === 0) return 0;
  let total = 0;
  const seen = new Set<Element>();
  for (const a of attacks.sort((x, y) => y.v - x.v)) {
    total += seen.has(a.el) ? a.v * 0.5 : a.v;
    seen.add(a.el);
  }
  status.sort((x, y) => y - x).forEach((v, i) => (total += i === 0 ? v : v * 0.4));
  return total;
}

/**
 * The game's suggestion for a pending move with a full list: the slot to forget, or null when
 * the current moves are better than anything learning it would give.
 */
export function recommendForget(c: Creature, id: string): number | null {
  let best: number | null = null;
  let bestVal = moveSetValue(c, c.moves);
  c.moves.forEach((_, i) => {
    const v = moveSetValue(c, c.moves.map((m, j) => (j === i ? { id, tier: 1 } : m)));
    if (v > bestVal + 0.01) {
      bestVal = v;
      best = i;
    }
  });
  return best;
}

/**
 * Every move this Hexling would naturally know by now that it doesn't know (for Move Relearn):
 * its learnset up to its level, line attacks at each rank its form has reached, its signature and,
 * from Lv 26, its team move.
 */
export function naturalMoves(c: Creature): string[] {
  const out: string[] = [];
  const add = (id: string) => !out.includes(id) && !knows(c, id) && out.push(id);
  for (const e of learnset(species(c))) {
    if (e.level > c.level) continue;
    const d = MOVES[e.id];
    if (d.kind === 'attack' && d.rank >= 0) for (let r = d.rank; r <= Math.min(3, d.rank + c.stage); r++) add(attackId(attackEl(d), r));
    else add(e.id);
  }
  if (c.level >= TEAM_MOVE_LEVEL) add(teamMoveId(teamElement(species(c))));
  for (const e of extraMoves(species(c))) if (e.level <= c.level) add(e.id);
  return out;
}

/** Swap the move in slot `index` for `id` (Move Relearn): a fresh move at tier 1. */
export function relearnMove(c: Creature, index: number, id: string): boolean {
  if (!c.moves[index] || knows(c, id) || !MOVES[id]) return false;
  c.moves[index] = { id, tier: 1 };
  c.pendingMoves = c.pendingMoves.filter((p) => p !== id);
  return true;
}

/** Player decision on a pending move: replace slot `replaceIndex`, or null to skip it. */
export function resolvePending(c: Creature, id: string, replaceIndex: number | null) {
  c.pendingMoves = c.pendingMoves.filter((p) => p !== id);
  if (replaceIndex === null || knows(c, id)) return;
  c.moves[replaceIndex] = { id, tier: 1 };
}

export function createCreature(speciesId: string, level = 1, stage = 0): Creature {
  const c: Creature = {
    uid: nextUid++,
    speciesId,
    level,
    xp: 0,
    stage: 0,
    stars: 0,
    hp: 1,
    moves: [],
    learnIndex: 0,
    pendingMoves: [],
  };
  learnMoves(c, true);
  for (let i = 0; i < stage; i++) evolve(c);
  c.hp = stats(c).hp;
  return c;
}

/** Level scaling factor shared by stats and damage, so hits-to-KO stays steady as you level. */
export function levelFactor(level: number): number {
  return 1 + level * 0.1;
}

export function stats(c: Creature): Stats {
  const b = species(c).base;
  const mult = STAGE_MULT[c.stage] * (1 + STAR_MULT * c.stars);
  const lv = levelFactor(c.level);
  const n = (k: keyof Stats) => natureMult(c.nature, k);
  return {
    hp: Math.round((b.hp * 1.2 + 20) * lv * mult * n('hp')),
    atk: Math.round(b.atk * lv * mult * n('atk')),
    def: Math.round(b.def * lv * mult * n('def')),
    spd: Math.round(b.spd * lv * mult * n('spd')),
  };
}

/** Uses left on a move, or Infinity when it's unlimited. */
export function usesLeft(slot: MoveSlot): number {
  const max = maxUses(MOVES[slot.id]);
  return max === null ? Infinity : Math.max(0, max - (slot.used ?? 0));
}
export const hasUses = (slot: MoveSlot) => usesLeft(slot) > 0;

/** "7/10 uses" or "unlimited uses". */
export function usesText(slot: MoveSlot): string {
  const max = maxUses(MOVES[slot.id]);
  return max === null ? 'unlimited uses' : `${usesLeft(slot)}/${max} uses`;
}

/** Spend one use (no-op for unlimited moves). */
export function spendUse(slot: MoveSlot) {
  if (maxUses(MOVES[slot.id]) !== null) slot.used = (slot.used ?? 0) + 1;
}

/** Restore move uses: all of them, or `frac` of each move's maximum (rounded up). */
export function restoreUses(c: Creature, frac = 1) {
  for (const m of c.moves) {
    const max = maxUses(MOVES[m.id]);
    if (max === null || !m.used) continue;
    m.used = frac >= 1 ? 0 : Math.max(0, m.used - Math.ceil(max * frac));
  }
}

/** True if any limited move has been used. */
export const usesSpent = (c: Creature) => c.moves.some((m) => (m.used ?? 0) > 0);

/** Every move is out of uses: the creature falls back to a basic attack of its own type. */
export const outOfMoves = (c: Creature) => c.moves.every((m) => !hasUses(m));
export const fallbackMove = (c: Creature): MoveSlot => ({ id: attackId(creatureTypes(c)[0], 0), tier: 1 });

export function moveDef(slot: MoveSlot): MoveDef {
  return MOVES[slot.id];
}

export function isAlive(c: Creature): boolean {
  return c.hp > 0;
}

/** Change level while keeping HP proportional. Respects level cap. Returns levels gained. */
export function addLevels(c: Creature, n: number): number {
  const before = c.level;
  const oldMax = stats(c).hp;
  c.level = Math.min(levelCap(c), c.level + n);
  if (c.level === levelCap(c)) c.xp = 0;
  const newMax = stats(c).hp;
  c.hp = Math.max(1, Math.round(c.hp + (newMax - oldMax)));
  learnMoves(c);
  return c.level - before;
}

/** How many levels' worth of XP a capped creature can store. */
export const BANK_LEVELS = 5;

/** The most XP a creature can store at its cap: enough for the next BANK_LEVELS levels. */
export function bankLimit(c: Pick<Creature, 'stage' | 'stars'>): number {
  const cap = levelCap(c);
  let t = 0;
  for (let l = cap; l < cap + BANK_LEVELS; l++) t += xpToNext(l);
  return t;
}

/** Stored XP measured in levels past the current cap (fractional, e.g. 2.4). */
export function bankedLevels(c: Creature): number {
  let left = c.banked ?? 0;
  let n = 0;
  for (let l = levelCap(c); left > 0; l++) {
    if (left < xpToNext(l)) return n + left / xpToNext(l);
    left -= xpToNext(l);
    n++;
  }
  return n;
}

export interface XpGain {
  levels: number;
  /** XP that went into storage because the creature is at its cap. */
  banked: number;
  /** XP earned at the cap with the store already full. */
  overflow: number;
}

/**
 * Adds XP. Below the cap it levels up as usual; anything earned at the cap is stored (up to
 * bankLimit) and whatever doesn't fit is reported as overflow.
 */
export function gainXp(c: Creature, amount: number): XpGain {
  let left = Math.round(amount);
  let levels = 0;
  while (left > 0 && c.level < levelCap(c)) {
    const need = xpToNext(c.level) - c.xp;
    if (left < need) {
      c.xp += left;
      left = 0;
    } else {
      left -= need;
      c.xp = 0;
      levels += addLevels(c, 1);
    }
  }
  if (c.level >= levelCap(c)) c.xp = 0;
  const room = Math.max(0, bankLimit(c) - (c.banked ?? 0));
  const banked = Math.min(room, left);
  if (banked > 0) c.banked = (c.banked ?? 0) + banked;
  return { levels, banked, overflow: left - banked };
}

/** Adds XP; returns levels gained. */
export function addXp(c: Creature, amount: number): number {
  return gainXp(c, amount).levels;
}

/** Pour stored XP in after the cap rises. Returns levels gained. */
export function releaseBanked(c: Creature): number {
  const stored = c.banked ?? 0;
  if (!stored) return 0;
  c.banked = 0;
  const g = gainXp(c, stored);
  return g.levels;
}

export function canEvolve(c: Creature): boolean {
  return c.stage < MAX_STAGE;
}

/** Level a creature must reach before it can evolve: 30 for the first evolution, 65 for the second. */
export const evolveLevel = (c: Pick<Creature, 'stage'>) => STAGE_CAPS[c.stage];

/** Has another evolution and has reached the level for it (floor ceilings and stars don't change this). */
export const readyToEvolve = (c: Creature) => canEvolve(c) && c.level >= evolveLevel(c);

/** Evolve: big stat jump, each attack upgrades to the next rank it doesn't know, HP keeps its missing amount. */
export function evolve(c: Creature): boolean {
  if (!canEvolve(c)) return false;
  const oldMax = stats(c).hp;
  c.stage += 1;
  const order = c.moves
    .map((m, i) => ({ m, i, d: MOVES[m.id] }))
    .filter((x) => x.d.kind === 'attack' && x.d.rank >= 0)
    .sort((a, b) => b.d.rank - a.d.rank);
  for (const { i, d } of order) {
    for (let r = d.rank + 1; r <= 3; r++) {
      const id = attackId(attackEl(d), r);
      if (!knows(c, id)) {
        c.moves[i] = { ...c.moves[i], id, used: 0 };
        break;
      }
    }
  }
  c.pendingMoves = c.pendingMoves.filter((p) => !knows(c, p));
  const newMax = stats(c).hp;
  c.hp = Math.min(newMax, c.hp + (newMax - oldMax));
  releaseBanked(c);
  return true;
}

export function canPrestige(c: Creature): boolean {
  return c.stars < MAX_STARS;
}

export function prestige(c: Creature): boolean {
  if (!canPrestige(c)) return false;
  const oldMax = stats(c).hp;
  c.stars += 1;
  const newMax = stats(c).hp;
  c.hp = Math.min(newMax, c.hp + (newMax - oldMax));
  releaseBanked(c);
  return true;
}

export function sharesType(a: Creature, b: Creature): boolean {
  const ta = creatureTypes(a);
  const tb = creatureTypes(b);
  return ta.some((t) => tb.includes(t));
}

export function canBuffMove(slot: MoveSlot): boolean {
  return slot.tier < MAX_TIER;
}

export function healFraction(c: Creature, frac: number) {
  const max = stats(c).hp;
  c.hp = Math.min(max, c.hp + Math.ceil(max * frac));
  // A full heal also cures any status condition.
  if (frac >= 1) c.status = undefined;
}

/** Clear a creature's status condition. */
export function cureStatus(c: Creature) {
  c.status = undefined;
}

/** Catch-up XP: bonus grows with the level gap to the highest level creature you own. */
export function catchUpMultiplier(level: number, highestLevel: number): number {
  return Math.min(BALANCE.catchUpMax, 1 + BALANCE.catchUpPerLevel * Math.max(0, highestLevel - level));
}
