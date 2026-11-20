/**
 * Heat: optional difficulty for players who have won. Each level adds one rule on top of all the
 * levels below it. Winning a run at your highest unlocked Heat unlocks the next one.
 */
export interface HeatLevel {
  name: string;
  /** The rule this level adds. */
  desc: string;
}

export const HEAT_LEVELS: HeatLevel[] = [
  { name: 'Heat 0', desc: 'The standard game.' },
  { name: 'Heat 1', desc: 'Enemies are 1/1/2 levels higher on floors 1/2/3.' },
  { name: 'Heat 2', desc: 'Survivors only recover 25% HP after a win (Iron Will: 34%).' },
  { name: 'Heat 3', desc: 'Shop prices are 25% higher.' },
  { name: 'Heat 4', desc: 'Trainers are 1/2/3 more levels higher and always carry held items. Guardians bring a second rule (and are 2 levels lower for it).' },
  { name: 'Heat 5', desc: 'Guardians are 3 levels higher.' },
  { name: 'Heat 6', desc: 'Battles pay 25% fewer coins.' },
  { name: 'Heat 7', desc: 'Enemies are another 1/2/3 levels higher.' },
  { name: 'Heat 8', desc: 'Guardians bring a third rule, are 3 more levels higher (2 lower for the rule) and their whole team holds items.' },
];

export const MAX_HEAT = HEAT_LEVELS.length - 1;

/** Modifiers for a run at this Heat, on this floor (0-based). */
export function heatRules(heat: number, floor = 0) {
  const at = (n: number) => heat >= n;
  const step = floor + 1;
  return {
    // Heat 1 is gentler than Heat 7's step (1/1/2 rather than 1/2/3): it's the first Heat players try.
    enemyLevels: (at(1) ? [1, 1, 2][Math.min(floor, 2)] : 0) + (at(7) ? step : 0),
    healMult: at(2) ? 0.62 : 1,
    priceMult: at(3) ? 1.25 : 1,
    eliteLevels: at(4) ? step : 0,
    eliteItems: at(4),
    bossLevels: (at(5) ? 3 : 0) + (at(8) ? 3 : 0),
    coinMult: at(6) ? 0.75 : 1,
    bossTeamItems: at(8),
  };
}
