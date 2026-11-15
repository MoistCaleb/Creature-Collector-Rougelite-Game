import { attackId, buffId, debuffId, MAX_TIER, MOVES, type MoveDef } from '../data/moves';
import { SPECIES_BY_ID, type BaseStats, type Species } from '../data/species';
import type { Element, TypePair } from '../data/types';

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

export function levelCap(c: Pick<Creature, 'stage' | 'stars'>): number {
  return 12 + c.stage * 10 + c.stars * 3;
}

export function xpToNext(level: number): number {
  return 8 + level * 5;
}

export interface LearnEntry {
  id: string;
  level: number;
}

/** Ordered list of moves a species learns, each at a level. Attack ids are base ranks (shifted up on evolved creatures). */
export function learnset(sp: Species): LearnEntry[] {
  const [a, b] = sp.types;
  if (a === b) {
    return [
      { id: attackId(a, 0), level: 1 },
      { id: attackId(a, 1), level: 1 },
      { id: buffId(a), level: 5 },
      { id: attackId(a, 2), level: 9 },
      { id: debuffId(a), level: 13 },
      { id: attackId(a, 3), level: 18 },
    ];
  }
  return [
    { id: attackId(a, 0), level: 1 },
    { id: attackId(b, 0), level: 1 },
    { id: buffId(a), level: 5 },
    { id: attackId(b, 1), level: 9 },
    { id: debuffId(b), level: 12 },
    { id: attackId(a, 2), level: 16 },
    { id: attackId(b, 2), level: 21 },
  ];
}

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
  if (def.kind === 'attack') return unknownAttack(c, def.element, def.rank + c.stage);
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
      let weakest = -1;
      c.moves.forEach((m, i) => {
        const d = MOVES[m.id];
        if (d.kind === 'attack' && d.power < nd.power && (weakest < 0 || d.power < MOVES[c.moves[weakest].id].power)) weakest = i;
      });
      if (weakest >= 0) c.moves[weakest] = { id, tier: 1 };
    } else if (!c.pendingMoves.includes(id)) {
      c.pendingMoves.push(id);
    }
  }
  return learned;
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

/** Adds XP; returns levels gained. */
export function addXp(c: Creature, amount: number): number {
  if (c.level >= levelCap(c)) return 0;
  c.xp += Math.round(amount);
  let gained = 0;
  while (c.level < levelCap(c) && c.xp >= xpToNext(c.level)) {
    c.xp -= xpToNext(c.level);
    gained += addLevels(c, 1);
  }
  if (c.level >= levelCap(c)) c.xp = 0;
  return gained;
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
    .filter((x) => x.d.kind === 'attack')
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
}

/** Catch-up XP: bonus grows with the level gap to the highest level creature you own. */
export function catchUpMultiplier(level: number, highestLevel: number): number {
  return 1 + 0.25 * Math.max(0, highestLevel - level);
}
