import type { Element, TypePair } from './types';

export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

export interface Species {
  id: string;
  names: [string, string, string]; // per evolution stage
  types: TypePair;
  base: BaseStats;
}

function sp(
  id: string,
  names: [string, string, string],
  t1: Element,
  t2: Element,
  hp: number,
  atk: number,
  def: number,
  spd: number,
): Species {
  return { id, names, types: [t1, t2], base: { hp, atk, def, spd } };
}

export const SPECIES: Species[] = [
  // Pure types
  sp('emberkit', ['Emberkit', 'Blazefang', 'Infernox'], 'Fire', 'Fire', 55, 70, 45, 65),
  sp('frostling', ['Frostling', 'Glacimaw', 'Hailwyrm'], 'Frost', 'Frost', 60, 60, 60, 55),
  sp('sproutle', ['Sproutle', 'Thornback', 'Elderoot'], 'Nature', 'Nature', 70, 55, 65, 45),
  sp('pebblin', ['Pebblin', 'Bouldrake', 'Titanox'], 'Earth', 'Earth', 75, 60, 75, 30),
  sp('zapling', ['Zapling', 'Voltwing', 'Thundraxis'], 'Storm', 'Storm', 50, 65, 40, 80),
  sp('puddlet', ['Puddlet', 'Tidalfin', 'Leviaroc'], 'Water', 'Water', 65, 58, 60, 52),
  // Dual types
  sp('magmole', ['Magmole', 'Lavaburrow', 'Calderock'], 'Fire', 'Earth', 65, 65, 60, 40),
  sp('steamle', ['Steamle', 'Geyserp', 'Vaporeign'], 'Fire', 'Water', 58, 62, 55, 55),
  sp('sparkfox', ['Sparkfox', 'Pyrovolt', 'Plasmane'], 'Fire', 'Storm', 50, 72, 40, 73),
  sp('slushpup', ['Slushpup', 'Floetusk', 'Glaciorca'], 'Frost', 'Water', 68, 58, 62, 47),
  sp('rimehawk', ['Rimehawk', 'Galeclaw', 'Blizzaroc'], 'Frost', 'Storm', 52, 66, 45, 72),
  sp('mossling', ['Mossling', 'Marshtoad', 'Bogmaw'], 'Nature', 'Water', 72, 54, 62, 47),
  sp('burrowbud', ['Burrowbud', 'Rootmole', 'Grovelord'], 'Nature', 'Earth', 70, 60, 68, 37),
  sp('shalebeak', ['Shalebeak', 'Cliffrider', 'Stormspire'], 'Earth', 'Storm', 60, 66, 55, 54),
  sp('coralite', ['Coralite', 'Reefguard', 'Atollith'], 'Water', 'Earth', 70, 55, 72, 38),
  sp('pollenix', ['Pollenix', 'Buzzbloom', 'Hivequeen'], 'Nature', 'Storm', 55, 62, 48, 70),
  sp('frostfern', ['Frostfern', 'Iceblossom', 'Winterbloom'], 'Frost', 'Nature', 62, 60, 58, 55),
  sp('cragice', ['Cragice', 'Permafang', 'Tundrosaur'], 'Frost', 'Earth', 68, 64, 66, 37),
  sp('cinderwisp', ['Cinderwisp', 'Ashveil', 'Pyrewraith'], 'Fire', 'Nature', 54, 68, 48, 65),
];

export const SPECIES_BY_ID: Record<string, Species> = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

/** Starter pool available on a fresh save. More unlock by beating bosses. */
export const DEFAULT_STARTERS = ['emberkit', 'frostling', 'sproutle', 'pebblin', 'zapling', 'puddlet'];

export function speciesWithElement(el: Element): Species[] {
  return SPECIES.filter((s) => s.types.includes(el));
}
