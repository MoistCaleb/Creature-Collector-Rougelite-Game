import { BALANCE } from '../data/balance';
import { attackId, attackValue, buffId, debuffId, extraId, MAX_TIER, MOVES, specialId, type MoveDef } from '../data/moves';
import { hashString, Rng } from './rng';
import { SPECIES_BY_ID, type BaseStats, type Species } from '../data/species';
import { stabMultiplier, type Element, type TypePair } from '../data/types';

export interface MoveSlot {
  id: string;
  tier: number; // 1..3 (skill buffs)
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
  if (def.kind === 'attack' && def.rank >= 0) return unknownAttack(c, def.element, def.rank + c.stage);
  return knows(c, id) ? null : id;
}

/**
 * Learn every move the creature's level now allows. With a full move list, the move goes to
 * pendingMoves for the player to decide, or (auto, for enemies) replaces its weakest attack.
 * Returns names of moves learned immediately.
 */
export function learnMoves(c: Creature, auto = false): string[] {
  const learned: string[] = [];
  const set = learnset(species(c));
  while (c.learnIndex < set.length && set[c.learnIndex].level <= c.level) {
    const id = resolveLearn(c, set[c.learnIndex].id);
    c.learnIndex++;
    if (!id) continue;
    if (c.moves.length < MAX_MOVES) {
      c.moves.push({ id, tier: 1 });
      learned.push(MOVES[id].name);
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
      let v = attackValue(d, m.tier) * (d.bestType ? stabMultiplier(types[0], types) : stabMultiplier(d.element, types));
      if (d.priority || d.drain || d.execute || d.selfAfter || d.targetAfter) v *= 1.1;
      if (d.signature) v *= 1.15;
      attacks.push({ el: d.bestType ? types[0] : d.element, v });
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
  return {
    hp: Math.round((b.hp * 1.2 + 20) * lv * mult),
    atk: Math.round(b.atk * lv * mult),
    def: Math.round(b.def * lv * mult),
    spd: Math.round(b.spd * lv * mult),
  };
}

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
      const id = attackId(d.element, r);
      if (!knows(c, id)) {
        c.moves[i] = { ...c.moves[i], id };
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
