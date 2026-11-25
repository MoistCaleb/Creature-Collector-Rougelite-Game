import { LEGENDS } from '../data/legends';
import { SPECIES_BY_ID } from '../data/species';
import { traitsOf, type TraitId } from '../data/traits';
import { camp, campCrew, campHearts } from './camp';
import { learnMoves, stats, type Creature } from './creature';
import { hashString, Rng } from './rng';
import type { Meta } from './run';

/**
 * Eggs (2.07). Every egg works the same way: its strength (1-5) is rolled when it's laid, and the
 * stronger it is the longer it takes, 3 to 7 (finished runs for a camp Nest egg, won battles for a
 * Hatchery egg on a run). Strength gives the baby better odds of its line's rare trait and up to
 * two ★ stars. Every baby has two parents: it's one parent's line, with the other's colour and one
 * of its parts (see ui/sprites hatchSlot), each of its moves from one parent or the other, and a
 * name from both (see logic/creature).
 *
 * Camp Nest: breed two crew Hexlings with PARENT_HEARTS or more, or one of them with a legendary
 * you've caught (the baby is always the regular line; legendary eggs are always strength 3+).
 * Hatchlings wait in the Nursery (up to NURSERY_MAX, kept for good) and can be picked as a starter
 * on normal runs. They can't be parents, so strength never stacks.
 */

export type EggTier = 1 | 2 | 3 | 4 | 5;
/** How likely each strength is when an egg is laid (strong eggs are rarer). */
export const EGG_WEIGHTS = [30, 25, 20, 15, 10];
/** Odds of its line's rare ◆ trait, by strength. */
export const EGG_RARE = [0.35, 0.55, 0.75, 1, 1];
/** ★ stars it hatches with, by strength (never more than 2). */
export const EGG_STARS = [0, 0, 1, 1, 2];
/** Embers for releasing a hatchling, by strength. */
export const RELEASE_EMBERS = [2, 4, 6, 8, 10];
export const NURSERY_MAX = 6;
/** Camp hearts each regular parent needs. */
export const PARENT_HEARTS = 3;
export const TIER_NAMES = ['Small', 'Sturdy', 'Warm', 'Glowing', 'Radiant'];

/** Runs (Nest) or won battles (Hatchery) an egg of this strength takes. */
export const eggLength = (tier: EggTier): number => tier + 2;

export const isLegendId = (id: string): boolean => LEGENDS.some((l) => l.id === id);

/** Roll an egg's strength. Legendary eggs are always 3 or more (5-7 runs). */
export function rollEggTier(seed: number, legendary = false): EggTier {
  const r = new Rng(hashString(`${seed}:egg-tier`));
  const w = EGG_WEIGHTS.map((x, i) => (legendary && i < 2 ? 0 : x));
  let roll = r.next() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) {
    roll -= w[i];
    if (roll < 0) return (i + 1) as EggTier;
  }
  return 5;
}

/** A baby's trait: its line's rare one more often the stronger the egg, else one of the other two. */
export function eggTrait(speciesId: string, tier: EggTier, seed: number): TraitId | undefined {
  const set = traitsOf(speciesId);
  if (set.length <= 1) return set[0];
  const r = new Rng(hashString(`${seed}:egg-trait:${speciesId}`));
  if (set[2] && r.chance(EGG_RARE[tier - 1])) return set[2];
  return r.chance(0.5) ? set[0] : set[1];
}

/** Which of a baby's moves come from its other parent: each learnset entry, a coin flip. */
export function rollMix(seed: number): number {
  const r = new Rng(hashString(`${seed}:egg-mix`));
  let mix = 0;
  for (let i = 1; i < 8; i++) if (r.chance(0.5)) mix |= 1 << i;
  return mix;
}

/** Make a creature a hatchling: its other parent, its moves re-learned from both lines, its trait and stars. */
export function makeHatchling(c: Creature, other: string, mix: number, trait: TraitId | undefined, stars: number) {
  c.heir = { other, mix };
  c.moves = [];
  c.learnIndex = 0;
  c.pendingMoves = [];
  delete c.extraOffered;
  delete c.teamOffered;
  delete c.landMoves;
  delete c.landNews;
  delete c.shiny;
  delete c.ancient;
  learnMoves(c, true);
  if (trait) c.trait = trait;
  c.stars = Math.min(c.stars + stars, 5);
  c.hp = stats(c).hp;
}

// ---------------------------------------------------------------- the camp Nest

export interface NestEgg {
  /** The two parents (a legendary is always `b`). */
  a: string;
  b: string;
  tier: EggTier;
  /** Finished runs until it hatches (0: ready). */
  left: number;
  seed: number;
  laid: number;
}

export interface Hatchling {
  id: number;
  speciesId: string;
  /** The parent whose line it isn't. */
  other: string;
  trait?: TraitId;
  stars: number;
  tier: EggTier;
  mix: number;
  legendary?: boolean;
  at: number;
}

export interface PairRecord {
  /** Times hatched, and when first and last. */
  n: number;
  first: number;
  last: number;
  legendary?: boolean;
  /** The best strength it's hatched at. */
  best: EggTier;
}

export interface NestState {
  egg?: NestEgg;
  brood: Hatchling[];
  /** Every pair you've hatched (baby line + other parent), for the Hexlidex. */
  pairs: Record<string, PairRecord>;
  next: number;
}

export function nest(meta: Meta): NestState {
  const c = camp(meta);
  c.nest ??= { brood: [], pairs: {}, next: 1 };
  c.nest.brood ??= [];
  c.nest.pairs ??= {};
  c.nest.next ??= 1;
  return c.nest;
}

export const pairKey = (speciesId: string, other: string) => `${speciesId}+${other}`;

/** Who can be a parent now: crew lines with enough hearts, and legendaries you've caught. */
export function parentsAvailable(meta: Meta): { regular: string[]; legends: string[] } {
  return {
    regular: campCrew(meta)
      .map((c) => c.speciesId)
      .filter((id) => !isLegendId(id) && campHearts(meta, id) >= PARENT_HEARTS),
    legends: LEGENDS.filter((l) => meta.legends?.[l.id]?.caught).map((l) => l.id),
  };
}

/** Why these two can't breed now, or null if they can. */
export function whyNot(meta: Meta, a: string, b: string): string | null {
  const n = nest(meta);
  if (n.egg) return 'There is already an egg in the nest.';
  if (n.brood.length >= NURSERY_MAX) return `The Nursery is full (${NURSERY_MAX}). Release a hatchling first.`;
  if (a === b) return 'Pick two different lines.';
  if (isLegendId(a) && isLegendId(b)) return 'Two legendaries can’t breed: one parent must be a regular line.';
  const ok = parentsAvailable(meta);
  for (const id of [a, b]) {
    if (isLegendId(id) ? !ok.legends.includes(id) : !ok.regular.includes(id)) return `${SPECIES_BY_ID[id]?.names[0] ?? id} can’t be a parent right now.`;
  }
  return null;
}

/** Lay an egg in the nest. Its strength (and how many runs it takes) is rolled now. Caller saves. */
export function layNestEgg(meta: Meta, a: string, b: string, seed: number): NestEgg | null {
  if (whyNot(meta, a, b)) return null;
  // A legendary parent is always `b`.
  if (isLegendId(a)) [a, b] = [b, a];
  const tier = rollEggTier(seed, isLegendId(b));
  return (nest(meta).egg = { a, b, tier, left: eggLength(tier), seed, laid: Date.now() });
}

/** A run finished: the egg is a run closer to hatching. Returns true if it's now ready. */
export function tickNest(meta: Meta): boolean {
  const egg = meta.camp?.nest?.egg;
  if (!egg || egg.left <= 0) return false;
  egg.left -= 1;
  return egg.left === 0;
}

export const nestReady = (meta: Meta): boolean => meta.camp?.nest?.egg?.left === 0;

/** What a nest egg hatches into (decided by its seed, so it's the same whenever it's opened). */
export function eggBaby(egg: NestEgg): Omit<Hatchling, 'id' | 'at'> {
  const r = new Rng(hashString(`${egg.seed}:egg-line`));
  // A legendary parent (always b) never passes on its line.
  const [speciesId, other] = isLegendId(egg.b) || r.chance(0.5) ? [egg.a, egg.b] : [egg.b, egg.a];
  return {
    speciesId,
    other,
    trait: eggTrait(speciesId, egg.tier, egg.seed),
    stars: EGG_STARS[egg.tier - 1],
    tier: egg.tier,
    mix: rollMix(egg.seed),
    ...(isLegendId(other) ? { legendary: true } : {}),
  };
}

/** Hatch the nest's egg into the Nursery. Caller saves. */
export function hatchNest(meta: Meta, now = Date.now()): Hatchling | null {
  const n = nest(meta);
  if (!n.egg || n.egg.left > 0) return null;
  const h: Hatchling = { id: n.next++, ...eggBaby(n.egg), at: now };
  delete n.egg;
  n.brood.push(h);
  noteHatched(meta, h.speciesId, h.other, h.tier, now);
  return h;
}

/** A pair hatched (from the Nest or a Hatchery egg on a run): it goes in the Hexlidex's Hatched tab. Caller saves. */
export function noteHatched(meta: Meta, speciesId: string, other: string, tier: EggTier, now = Date.now()) {
  const pairs = nest(meta).pairs;
  const key = pairKey(speciesId, other);
  const rec = pairs[key];
  pairs[key] = rec
    ? { ...rec, n: rec.n + 1, last: now, best: Math.max(rec.best, tier) as EggTier }
    : { n: 1, first: now, last: now, best: tier, ...(isLegendId(other) ? { legendary: true } : {}) };
}

/** Release a hatchling from the Nursery for embers. Returns the embers (0 if it wasn't there). Caller saves. */
export function releaseHatchling(meta: Meta, id: number): number {
  const n = nest(meta);
  const i = n.brood.findIndex((h) => h.id === id);
  if (i < 0) return 0;
  const [h] = n.brood.splice(i, 1);
  const embers = RELEASE_EMBERS[h.tier - 1];
  camp(meta).embers += embers;
  return embers;
}

/** The hatchling as a creature at this level (its trait, stars and moves from both parents). */
export function hatchlingCreature(h: Hatchling, c: Creature): Creature {
  makeHatchling(c, h.other, h.mix, h.trait, h.stars);
  return c;
}

/** Hatched pairs, newest first. */
export function hatchedPairs(meta: Meta): { speciesId: string; other: string; rec: PairRecord }[] {
  return Object.entries(meta.camp?.nest?.pairs ?? {})
    .map(([k, rec]) => {
      const [speciesId, other] = k.split('+');
      return { speciesId, other, rec };
    })
    .filter((p) => SPECIES_BY_ID[p.speciesId] && SPECIES_BY_ID[p.other])
    .sort((a, b) => b.rec.last - a.rec.last);
}
