import { hashString } from '../logic/rng';
import type { BaseStats } from './species';

/**
 * Natures: every Hexling met on a run has one, a small lean in its stats (+10% to one, -10% to
 * another) and a line about its personality. Arena and online Arena teams have none.
 */
export type NatureId = 'brave' | 'fierce' | 'bold' | 'stubborn' | 'hasty' | 'timid' | 'hearty' | 'gentle' | 'steady' | 'quirky';

export interface Nature {
  name: string;
  up?: keyof BaseStats;
  down?: keyof BaseStats;
  /** A line about it, after its name ("Emberkit ..."). */
  blurb: string;
}

export const NATURE_LEAN = 0.1;

export const NATURES: Record<NatureId, Nature> = {
  brave: { name: 'Brave', up: 'atk', down: 'spd', blurb: 'charges in without a second thought.' },
  fierce: { name: 'Fierce', up: 'atk', down: 'def', blurb: 'would rather hit hard than play safe.' },
  bold: { name: 'Bold', up: 'def', down: 'atk', blurb: 'stands its ground and won’t be pushed around.' },
  stubborn: { name: 'Stubborn', up: 'def', down: 'spd', blurb: 'does things in its own time.' },
  hasty: { name: 'Hasty', up: 'spd', down: 'def', blurb: 'is always first out the door.' },
  timid: { name: 'Timid', up: 'spd', down: 'atk', blurb: 'is quick to dodge, slow to pick a fight.' },
  hearty: { name: 'Hearty', up: 'hp', down: 'spd', blurb: 'is tough as old roots.' },
  gentle: { name: 'Gentle', up: 'hp', down: 'atk', blurb: 'would rather patch you up than fight.' },
  steady: { name: 'Steady', blurb: 'is calm and even-tempered.' },
  quirky: { name: 'Quirky', blurb: 'does whatever it feels like.' },
};

export const NATURE_IDS = Object.keys(NATURES) as NatureId[];

/** A nature picked from a key (so seeded runs give everyone the same ones). */
export function natureFor(key: string): NatureId {
  return NATURE_IDS[hashString(`${key}:nature`) % NATURE_IDS.length];
}

/** The stat multiplier a nature gives (1 when it has none). */
export function natureMult(id: NatureId | undefined, stat: keyof BaseStats): number {
  const n = id ? NATURES[id] : undefined;
  if (!n) return 1;
  return n.up === stat ? 1 + NATURE_LEAN : n.down === stat ? 1 - NATURE_LEAN : 1;
}

/** "+Attack -Speed", or "" for a nature with no lean. */
export function natureLean(id: NatureId): string {
  const n = NATURES[id];
  const label: Record<keyof BaseStats, string> = { hp: 'HP', atk: 'Attack', def: 'Defense', spd: 'Speed' };
  return n.up && n.down ? `+${label[n.up]} −${label[n.down]}` : 'no lean';
}

// ---------------------------------------------------------------- bond

/**
 * Bond: battles a Hexling has won with you this run. Hearts at 3, 8 and 15 wins; each heart gives
 * it a better chance to hang on at 1 HP from a knockout blow, once a battle.
 */
export const BOND_HEARTS = [3, 8, 15];
export const BOND_ENDURE = [0, 0.1, 0.17, 0.25];

export function bondHearts(bond: number | undefined): number {
  return BOND_HEARTS.filter((n) => (bond ?? 0) >= n).length;
}

/** "+ATK −SPD" (or "even"). */
export function natureShort(id: NatureId): string {
  const n = NATURES[id];
  const label: Record<keyof BaseStats, string> = { hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD' };
  return n.up && n.down ? `+${label[n.up]} −${label[n.down]}` : 'even';
}
