import { isLegend } from '../data/legends';
import { MOVES } from '../data/moves';
import { SPECIES_BY_ID } from '../data/species';
import type { Element } from '../data/types';
import { creatureTypes, type Creature } from './creature';

/** Persistent record of everything you've encountered, across runs. */
export interface Dex {
  forms: string[]; // `${speciesId}:${stage}`
  moves: string[]; // move ids
  elements: Element[];
  caught: string[]; // species ids you've ever caught
}

export const emptyDex = (): Dex => ({ forms: [], moves: [], elements: [], caught: [] });

export const formKey = (speciesId: string, stage: number) => `${speciesId}:${stage}`;

/** Records into the dex; returns true if anything new was added. */
export function seeElement(dex: Dex, el: Element): boolean {
  if (dex.elements.includes(el)) return false;
  dex.elements.push(el);
  return true;
}

export function seeForm(dex: Dex, speciesId: string, stage: number): boolean {
  let changed = false;
  for (const el of SPECIES_BY_ID[speciesId].types) changed = seeElement(dex, el) || changed;
  const k = formKey(speciesId, stage);
  if (!dex.forms.includes(k)) {
    dex.forms.push(k);
    changed = true;
  }
  return changed;
}

export function seeMove(dex: Dex, id: string): boolean {
  const el = MOVES[id].element;
  let changed = el !== 'Neutral' && seeElement(dex, el);
  if (!dex.moves.includes(id)) {
    dex.moves.push(id);
    changed = true;
  }
  return changed;
}

/** A creature you own or face: its form, its elements and the moves it knows. */
export function seeCreature(dex: Dex, c: Creature, includeMoves: boolean): boolean {
  // Roaming legendaries aren't Hexlidex entries.
  let changed = isLegend(c.speciesId) ? false : seeForm(dex, c.speciesId, c.stage);
  for (const t of creatureTypes(c)) changed = seeElement(dex, t) || changed;
  if (includeMoves) for (const m of c.moves) changed = seeMove(dex, m.id) || changed;
  return changed;
}

export function hasSeenForm(dex: Dex, speciesId: string, stage: number): boolean {
  return dex.forms.includes(formKey(speciesId, stage));
}

/** Name of a form if seen, otherwise ???. */
export function formName(dex: Dex, speciesId: string, stage: number): string {
  return hasSeenForm(dex, speciesId, stage) ? SPECIES_BY_ID[speciesId].names[stage] : '???';
}
