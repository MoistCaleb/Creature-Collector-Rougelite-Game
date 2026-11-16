import { ELEMENTS, type Element } from '../data/types';
import { creatureTypes, type Creature } from './creature';

/**
 * Team synergy: two or more creatures sharing an element on your main team give the whole team a
 * bonus to that element's stat. Dual-type creatures count toward both of their elements.
 */
export type SynergyStat = 'atk' | 'def' | 'spd';

export const SYNERGY_STAT: Record<Element, SynergyStat> = {
  Fire: 'atk',
  Dragon: 'atk',
  Toxic: 'atk',
  Shadow: 'atk',
  Earth: 'def',
  Metal: 'def',
  Frost: 'def',
  Water: 'def',
  Storm: 'spd',
  Light: 'spd',
  Spirit: 'spd',
  Nature: 'spd',
};

export const SYNERGY_LABEL: Record<SynergyStat, string> = { atk: 'ATK', def: 'DEF', spd: 'SPD' };

/** Bonus for this many creatures sharing an element. */
export function synergyBonus(count: number): number {
  return count >= 4 ? 0.18 : count === 3 ? 0.12 : count === 2 ? 0.06 : 0;
}

export interface SynergyLine {
  element: Element;
  count: number;
  stat: SynergyStat;
  bonus: number;
}

/** Active synergies for a team, strongest first. `scale` multiplies every bonus (Harmonist doubles them). */
export function teamSynergy(team: Creature[], scale = 1): SynergyLine[] {
  const counts = new Map<Element, number>();
  for (const c of team) {
    const [a, b] = creatureTypes(c);
    for (const el of a === b ? [a] : [a, b]) counts.set(el, (counts.get(el) ?? 0) + 1);
  }
  return ELEMENTS.filter((el) => (counts.get(el) ?? 0) >= 2)
    .map((el) => ({ element: el, count: counts.get(el)!, stat: SYNERGY_STAT[el], bonus: synergyBonus(counts.get(el)!) * scale }))
    .sort((x, y) => y.bonus - x.bonus);
}

/** Stat multipliers the synergies add up to. */
export function synergyMults(team: Creature[], scale = 1): Record<SynergyStat, number> {
  const m = { atk: 1, def: 1, spd: 1 };
  for (const s of teamSynergy(team, scale)) m[s.stat] += s.bonus;
  return m;
}
