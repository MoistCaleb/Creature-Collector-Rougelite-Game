import { fastId } from './moves';
import { SPECIES_BY_ID, type Species } from './species';

/**
 * Roaming legendaries: three one-of-a-kind Hexlings that wander the later floors of a run. They
 * aren't part of the Hexlidex count, can't be starters, and flee after a few turns, keeping the
 * damage you did for the next time you meet. Catch one and it joins that run; caught, it roams
 * no more.
 */
export const LEGENDS: Species[] = [
  { id: 'solmane', names: ['Solmane', 'Solmane', 'Solmane'], types: ['Light', 'Fire'], base: { hp: 92, atk: 90, def: 78, spd: 84 }, signature: fastId('Light') },
  { id: 'tidecrown', names: ['Tidecrown', 'Tidecrown', 'Tidecrown'], types: ['Water', 'Storm'], base: { hp: 98, atk: 84, def: 86, spd: 76 }, signature: fastId('Water') },
  { id: 'umbrawyrm', names: ['Umbrawyrm', 'Umbrawyrm', 'Umbrawyrm'], types: ['Shadow', 'Dragon'], base: { hp: 88, atk: 96, def: 74, spd: 88 }, signature: fastId('Shadow') },
];

// Known by id everywhere (sprites, stats, battles), but kept out of SPECIES and so out of every
// pool, the Hexlidex, starters and the Arena.
for (const l of LEGENDS) SPECIES_BY_ID[l.id] = l;

export const isLegend = (id: string): boolean => LEGENDS.some((l) => l.id === id);

/** A legendary's attacks do this share of their usual damage. */
export const LEGEND_DAMAGE = 0.6;
/** Turns a legendary stays before it flees. */
export const LEGEND_FLEE_TURNS = 4;
/** Chance a floor after the first has a legendary roaming it (unseeded runs). */
export const LEGEND_CHANCE = 0.3;
/** Health a legendary comes back with after being beaten but not caught. */
export const LEGEND_RECOVER = 0.4;
