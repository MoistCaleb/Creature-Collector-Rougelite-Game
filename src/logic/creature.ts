import { getMove, MAX_TIER, type MoveDef } from '../data/moves';
import { SPECIES_BY_ID, type BaseStats, type Species } from '../data/species';
import type { Element, TypePair } from '../data/types';

export interface MoveSlot {
  element: Element;
  rank: number;
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
}

export type Stats = BaseStats;

export const MAX_STAGE = 2;
export const MAX_STARS = 5;
export const MAX_MOVES = 4;
const STAGE_MULT = [1, 1.35, 1.7];
const STAR_MULT = 0.15;
/** Levels at which move slots 3 and 4 unlock. */
export const MOVE_UNLOCK_LEVELS = [1, 1, 6, 12];

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

/** Ordered list of moves a species learns; slot i unlocks at MOVE_UNLOCK_LEVELS[i]. */
export function learnset(sp: Species): MoveSlot[] {
  const [a, b] = sp.types;
  if (a === b) {
    return [0, 1, 2, 3].map((rank) => ({ element: a, rank, tier: 1 }));
  }
  return [
    { element: a, rank: 0, tier: 1 },
    { element: b, rank: 0, tier: 1 },
    { element: a, rank: 2, tier: 1 },
    { element: b, rank: 2, tier: 1 },
  ];
}

/** Adds any moves the creature is now high enough level to know. Returns names of new moves. */
export function learnMoves(c: Creature): string[] {
  const learned: string[] = [];
  const set = learnset(species(c));
  for (let i = c.moves.length; i < MAX_MOVES; i++) {
    if (c.level < MOVE_UNLOCK_LEVELS[i]) break;
    const slot = { ...set[i], rank: Math.min(3, set[i].rank + c.stage) };
    c.moves.push(slot);
    learned.push(getMove(slot.element, slot.rank).name);
  }
  return learned;
}

export function createCreature(speciesId: string, level = 1, stage = 0): Creature {
  const c: Creature = { uid: nextUid++, speciesId, level, xp: 0, stage, stars: 0, hp: 1, moves: [] };
  learnMoves(c);
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
  return getMove(slot.element, slot.rank);
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

/** Evolve: big stat jump, moves upgrade a rank, HP keeps its missing amount. */
export function evolve(c: Creature): boolean {
  if (!canEvolve(c)) return false;
  const oldMax = stats(c).hp;
  c.stage += 1;
  c.moves = c.moves.map((m) => ({ ...m, rank: Math.min(3, m.rank + 1) }));
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
