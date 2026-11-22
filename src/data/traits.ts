import { hashString } from '../logic/rng';
import { LEGEND_TRAITS, LINE_TRAITS, TRAITS, type TraitDef, type TraitId } from './traitTable';

export { LEGEND_TRAITS, LINE_TRAITS, TRAITS };
export type { TraitDef, TraitId };

/** Roll odds: the first common, the second common (cumulative), then the rare. */
export const TRAIT_ODDS = [0.425, 0.85] as const;

/** The traits a line can have: [common, common, rare], or a legendary's one. */
export function traitsOf(speciesId: string): TraitId[] {
  const l = LEGEND_TRAITS[speciesId];
  if (l) return [l];
  return LINE_TRAITS[speciesId] ?? [];
}

/** Is this the line's rare trait (◆)? A legendary's trait counts as rare. */
export function isRareTrait(speciesId: string, id: TraitId): boolean {
  const set = traitsOf(speciesId);
  return set.length === 1 ? set[0] === id : set[2] === id;
}

/** A trait for this line from a seed key (the same key always gives the same trait). */
export function rollTrait(speciesId: string, key: string): TraitId | undefined {
  const set = traitsOf(speciesId);
  if (set.length <= 1) return set[0];
  const r = (hashString(`${speciesId}:trait:${key}`) % 10000) / 10000;
  return r < TRAIT_ODDS[0] ? set[0] : r < TRAIT_ODDS[1] ? set[1] : set[2];
}

interface Holder {
  speciesId: string;
  uid: number;
  stage: number;
  trait?: TraitId;
}

let enabled = true;
const silenced = new WeakSet<object>();
/** The balance bot: this Hexling fights without its trait (to measure one side's traits alone). */
export function silenceTrait(c: object) {
  silenced.add(c);
}
/** Turn every trait off (the balance bot compares runs with and without them). */
export function setTraitsEnabled(on: boolean) {
  enabled = on;
}

/** A Hexling's trait: its own, or (older saves, Arena teams) one rolled from its id. */
export function traitOf(c: Holder): TraitId | undefined {
  if (!enabled || silenced.has(c)) return undefined;
  if (c.trait && traitsOf(c.speciesId).includes(c.trait)) return c.trait;
  return rollTrait(c.speciesId, `uid${c.uid}`);
}

/** Does it have this trait? */
export const hasTrait = (c: Holder, id: TraitId): boolean => traitOf(c) === id;

/** The trait's number for this Hexling: the stronger one in its final form (legendaries always). */
export function traitValue(c: Holder, id: TraitId): number {
  return TRAITS[id].v[c.stage >= 2 || TRAITS[id].kind === 'Legendary' ? 1 : 0];
}

/** "Thick Hide: Takes −12% from super-effective hits" (the final form's numbers when final). */
export function traitLine(id: TraitId, final: boolean): string {
  const t = TRAITS[id];
  return `${t.name}: ${final ? `${t.text} → ${t.finalText}` : t.text}`;
}
