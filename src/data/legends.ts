import { fastId } from './moves';
import { SPECIES, SPECIES_BY_ID, type Species } from './species';

/**
 * Roaming legendaries: three one-of-a-kind Hexlings that wander the later floors of a run. They
 * flee after a few turns, keeping the damage you did for the next time you meet. Catch one and it
 * joins that run, gets its Hexlidex entry and can be brought to the Arena; caught, it roams no
 * more. They are never starters, and they only have one form (their final one).
 */
export const LEGENDS: Species[] = [
  { id: 'solmane', names: ['Solmane', 'Solmane', 'Solmane'], types: ['Light', 'Fire'], base: { hp: 92, atk: 90, def: 78, spd: 84 }, signature: fastId('Light') },
  { id: 'tidecrown', names: ['Tidecrown', 'Tidecrown', 'Tidecrown'], types: ['Water', 'Storm'], base: { hp: 98, atk: 84, def: 86, spd: 76 }, signature: fastId('Water') },
  { id: 'umbrawyrm', names: ['Umbrawyrm', 'Umbrawyrm', 'Umbrawyrm'], types: ['Shadow', 'Dragon'], base: { hp: 88, atk: 96, def: 74, spd: 88 }, signature: fastId('Shadow') },
];

// Known by id everywhere (sprites, stats, battles), but kept out of SPECIES and so out of every
// spawn pool, starter choice and computer Arena team.
for (const l of LEGENDS) SPECIES_BY_ID[l.id] = l;

export const isLegend = (id: string): boolean => LEGENDS.some((l) => l.id === id);

/** Every Hexlidex entry: the regular lines, then the legendaries. */
export const DEX_SPECIES: Species[] = [...SPECIES, ...LEGENDS];
/** Forms a species has: three, or a legendary's one. */
export const dexStages = (id: string): number[] => (isLegend(id) ? [2] : [0, 1, 2]);
/** Every form in the Hexlidex. */
export const DEX_FORMS = DEX_SPECIES.reduce((t, s) => t + dexStages(s.id).length, 0);

/** A legendary's attacks do this share of their usual damage. */
export const LEGEND_DAMAGE = 0.6;
/** Turns a legendary stays before it flees. */
export const LEGEND_FLEE_TURNS = 4;
/** Chance a floor after the first has a legendary roaming it (unseeded runs). */
export const LEGEND_CHANCE = 0.3;
/** Health a legendary comes back with after being beaten but not caught. */
export const LEGEND_RECOVER = 0.4;
