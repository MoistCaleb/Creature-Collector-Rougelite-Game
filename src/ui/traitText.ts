import { isRareTrait, traitOf, TRAITS, type TraitId } from '../data/traits';
import type { Creature } from '../logic/creature';

/** "◆ Second Skin" for a line's rare trait, else just the name. */
export function traitName(speciesId: string, id: TraitId): string {
  return `${isRareTrait(speciesId, id) ? '◆ ' : ''}${TRAITS[id].name}`;
}

/** The Hexling's trait name, or '' if its line has none. */
export function traitTag(c: Creature): string {
  const t = traitOf(c);
  return t ? traitName(c.speciesId, t) : '';
}

/** What the trait does, with the final form's stronger numbers noted. */
export function traitDescOf(id: TraitId, final: boolean): string {
  const t = TRAITS[id];
  if (t.kind === 'Legendary') return t.text;
  return final ? `${t.text} → final form: ${t.finalText}` : `${t.text} (final form: ${t.finalText})`;
}

/** "Trait: ◆ Thick Hide · Takes −12% from super-effective hits (final form: −20%)" */
export function traitLine(c: Creature): string {
  const t = traitOf(c);
  return t ? `Trait: ${traitName(c.speciesId, t)} · ${traitDescOf(t, c.stage >= 2)}` : '';
}
